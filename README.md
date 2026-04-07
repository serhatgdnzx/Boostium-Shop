# Boostium Shop

Boostium.shop, Discord sunucu boost paketlerinin sunulduğu, kullanıcıların hesap bakiyesiyle alışveriş yaptığı ve tüm operasyonların yönetici panelinden izlenebildiği bir web uygulamasıdır.

# Ödeme ve bakiye modeli
Kullanıcılar önce hesaplarına bakiye yükler; boost satın alımları bu bakiyeden düşülür. Bakiye yüklemesi NOWPayments entegrasyonu ile yapılır: sunucu, NOWPayments API üzerinden ödeme oluşturur, order_id içinde kullanıcıyı tanımlayan bir kalıp kullanılır ve her işlem kullanıcı kaydındaki PaymentHistory dizisine (ödeme kimliği, tutar, para birimi, kripto ödeme adresi/tutarı, durum vb.) işlenir. Ödeme sonuçları hem IPN webhook (confirmed / finished durumları) hem de istemci tarafında ödeme durumu sorgulama ile senkronize edilir; onaylandığında kullanıcının UserBalance alanı güncellenir, çift işlem riskine karşı aynı ödeme için tekrar bakiye eklenmesi engellenmeye çalışılır. Geliştirme için test modu desteği bulunur; üretimde API anahtarları ve gizli yapılandırma ortam değişkenleri / güvenli config ile verilmelidir.

# Boost satın alma
Paketler süre (ör. 1 veya 3 ay) ve miktar bazında listelenir; stok durumu yönetilebilir. Satın alma, yeterli UserBalance kontrolü ile gerçekleşir: tutar bakiyeden düşülür, TotalSpent ve site geneli istatistikleri (PurchasedBoosts, SuccessfulOrders, BoostedServers) güncellenir, işlem BoostPurchaseHistory içinde saklanır. İsteğe bağlı olarak Discord bot token ile davet bağlantısı doğrulanabilir; başarılı siparişler yapılandırılmışsa Discord webhook ile kanala bildirim gönderilir.

# Rank / XP
Hem bakiye yüklemelerinden hem de boost harcamalarından RankXP kazanımı ve rütbe güncellemesi, tanımlı eşiklere göre hesaplanır.

# Yönetim tarafı
Yönetici arayüzü üzerinden kullanıcılar, ödemeler listesi, boost satın alma geçmişi, paket ve site ayarları, promosyon kodları, aktivite logları ve özet istatistikler yönetilebilir; ödeme kayıtları için iade gibi işlemler desteklenir (Genel sistem, ihtiyaçlara göre değiştirilip düzenlenebilir. Sistemi yalnızca Discord boost satışı için kullanmak yerine, genel bir satış alanı olarak da kullanıma açabilirsiniz).
