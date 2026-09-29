/* PRONTO Teklif bağlantı ayarı — artık Sipariş Takibi ile AYNI Supabase projesi.
   publishable (anon) anahtar gizli değildir; güvenlik şifre + RLS kurallarıyla sağlanır.
   Teklif girişi (ekip@pronto.app) yalnızca teklif tablolarını görebilir.
   ⚠ secret / service_role anahtarını ASLA buraya yazmayın. */
window.PRONTO_CONFIG = {
  url: 'https://ehdoledrfdoluixohypp.supabase.co',
  anonKey: 'sb_publishable_S20ikh0v3dOAFjY-zX6p8Q_aHATfRxW',
  email: 'ekip@pronto.app'
};
