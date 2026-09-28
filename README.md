# PRONTO — Teklif / Satış

- **Web:** https://ofischi.github.io/PRONTO/
- **Windows:** Releases bölümündeki `PRONTO-Kurulum-x.y.z.exe`

## Dosyalar
| Dosya | Görev |
|---|---|
| `index.html` | Programın tamamı. Güncellenince tüm bilgisayarlar yeni sürümü otomatik alır. |
| `config.js` | Supabase adresi + anon anahtar. Sadece şifre sorulması bunun sayesinde. |
| `main.js`, `package.json`, `build/` | Windows .exe kabuğu. |
| `.github/workflows/` | .exe'yi GitHub'da derler (Actions → Run workflow). |
| `supabase-kurulum.sql` | Supabase'de bir kez çalıştırılır. |

## Yeni .exe sürümü
`package.json` içindeki `version` değerini artırın → Actions → **Run workflow**.
Sadece `index.html` değiştiyse .exe'ye gerek yoktur.
