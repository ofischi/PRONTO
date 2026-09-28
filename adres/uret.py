#!/usr/bin/env python3
"""PRONTO — il / ilçe / mahalle listesi üretici.

Kaynak: TÜİK MEDAS verisi — github.com/ubeydeozdmr/turkiye-api (MIT) datasets/<yıl>/ klasörü.
Yedek: PTT posta kodu listesi (pk_list.zip) de okunabilir.
Her il için adres/<il>.json üretir; program yalnızca seçilen ilin dosyasını indirir.
Yalnızca Python standart kütüphanesi kullanılır.

  python3 adres/uret.py --tuik turkiye-api/datasets   (GitHub işi bunu 6 ayda bir çalıştırır)
  python3 adres/uret.py --ptt pk_list.zip
  python3 adres/uret.py --seed data.json    (ilk kurulum: [plaka, il, ilçe, mahalle, pk] listesi)
"""
import argparse, datetime, io, json, os, re, sys, zipfile
import xml.etree.ElementTree as ET

ILLER = ['Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin', 'Aydın', 'Balıkesir',
         'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli',
         'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkâri',
         'Hatay', 'Isparta', 'Mersin', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir',
         'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş', 'Nevşehir',
         'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Tekirdağ', 'Tokat',
         'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman',
         'Kırıkkale', 'Batman', 'Şırnak', 'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce']
PLAKA = {f'{i + 1:02d}': ad for i, ad in enumerate(ILLER)}

def tr_upper(s): return s.replace('i', 'İ').replace('ı', 'I').upper()
def tr_lower(s): return s.replace('İ', 'i').replace('I', 'ı').lower()
def slug(s):
    s = tr_lower(s)
    for a, b in zip('çğıöşüâîû', 'cgiosuaiu'): s = s.replace(a, b)
    return re.sub(r'[^a-z0-9]', '', s)
def tr_key(s):  # Türkçe alfabetik sıralama
    return [('abcçdefgğhıijklmnoöprsştuüvyz'.find(c) if c in 'abcçdefgğhıijklmnoöprsştuüvyz' else 100 + ord(c)) for c in tr_lower(s)]

def norm_ad(s):
    s = re.sub(r'\s+', ' ', str(s or '')).strip()
    s = tr_upper(s)
    s = re.sub(r'\bMAH\b\.?', 'MAH.', s)
    return s[:80]

# ---- xlsx okuma (standart kütüphane)
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def col_idx(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group(0): n = n * 26 + ord(ch) - 64
    return n - 1
def read_xlsx(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    sheet = sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n))[0]
    for row in ET.fromstring(z.read(sheet)).iter('{%s}row' % NS['m']):
        out = {}
        for c in row.findall('m:c', NS):
            t, v = c.get('t'), c.find('m:v', NS)
            if t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
            elif v is None: continue
            elif t == 's': val = shared[int(v.text)]
            else: val = v.text
            out[col_idx(c.get('r'))] = val
        if out: yield [out.get(i, '') for i in range(max(out) + 1)]

def from_ptt(path):
    data = open(path, 'rb').read()
    if data[:2] == b'PK' and not any(n.startswith('xl/') for n in zipfile.ZipFile(io.BytesIO(data)).namelist()):
        z = zipfile.ZipFile(io.BytesIO(data))
        data = z.read([n for n in z.namelist() if n.lower().endswith('.xlsx')][0])
    rows, head = [], None
    for r in read_xlsx(data):
        cells = [tr_lower(str(x).strip()) for x in r]
        if head is None:
            if 'pk' in cells and any(c.startswith('mahalle') for c in cells):
                head = {'il': cells.index('il'), 'ilce': next(i for i, c in enumerate(cells) if c.startswith('ilçe')),
                        'mah': next(i for i, c in enumerate(cells) if c.startswith('mahalle')), 'pk': cells.index('pk')}
            continue
        g = lambda k: str(r[head[k]]).strip() if head[k] < len(r) else ''
        pk = re.sub(r'\D', '', g('pk')).zfill(5)
        if len(pk) == 5 and g('mah'): rows.append((pk[:2], g('ilce'), g('mah'), pk))
    if head is None: sys.exit('Başlık satırı bulunamadı (il, ilçe, Mahalle, PK)')
    return rows

def from_tuik(root):
    """turkiye-api datasets klasörü: en yeni yıl alt klasörünü kullanır."""
    yillar = sorted(d for d in os.listdir(root) if d.isdigit() and os.path.isdir(os.path.join(root, d)))
    base = os.path.join(root, yillar[-1]) if yillar else root
    load = lambda n: (lambda d: d.get('data', d) if isinstance(d, dict) else d)(json.load(open(os.path.join(base, n + '.json'), encoding='utf-8')))
    ilce = {d['id']: d['name'] for d in load('districts')}
    rows = []
    for kind, suffix in (('neighborhoods', ' MAH'), ('villages', ' KÖYÜ')):
        for m in load(kind):
            if m.get('districtId') not in ilce: continue
            ad = str(m['name']).strip()
            if not re.search(r'\b(MAH|MAHALLESİ|KÖYÜ|KÖY)\.?$', tr_upper(ad)): ad += suffix
            rows.append((f"{int(m['provinceId']):02d}", ilce[m['districtId']], ad, str(m.get('postalCode') or '')))
    print('Kaynak:', base)
    return rows

def from_seed(path):
    return [(r[0], r[2], r[3], r[4]) for r in json.load(open(path, encoding='utf-8'))]

def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--ptt'); g.add_argument('--seed'); g.add_argument('--tuik')
    ap.add_argument('--out', default=os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument('--surum', default=datetime.date.today().isoformat())
    a = ap.parse_args()
    rows = from_ptt(a.ptt) if a.ptt else from_tuik(a.tuik) if a.tuik else from_seed(a.seed)

    iller = {}
    for plaka, ilce, mah, pk in rows:
        if plaka not in PLAKA: continue
        ilce, mah = norm_ad(ilce), norm_ad(mah)
        iller.setdefault(plaka, {}).setdefault(ilce, {})[mah] = pk
    # Güvenlik: eksik / bozuk bir liste yayınlanmasın
    toplam = sum(len(m) for il in iller.values() for m in il.values())
    if len(iller) != 81 or toplam < 45000:
        sys.exit(f'Liste eksik görünüyor: {len(iller)} il, {toplam} mahalle — yayınlanmadı')

    for plaka, ilceler in iller.items():
        ad = PLAKA[plaka]
        doc = {'v': a.surum, 'il': ad, 'ilceler': [[ilce, [[m, pk] for m, pk in sorted(mah.items(), key=lambda x: tr_key(x[0]))]]
                                                    for ilce, mah in sorted(ilceler.items(), key=lambda x: tr_key(x[0]))]}
        with open(os.path.join(a.out, slug(ad) + '.json'), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(a.out, 'surum.json'), 'w', encoding='utf-8') as f:
        json.dump({'v': a.surum, 'il': len(iller), 'mahalle': toplam}, f, ensure_ascii=False)
    print(f'Tamam: {len(iller)} il, {sum(len(x) for x in iller.values())} ilçe, {toplam} mahalle/köy (sürüm {a.surum})')

if __name__ == '__main__':
    main()
