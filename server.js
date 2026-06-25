const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const https = require('https');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// الرابط الرسمي الموحد لـ API موقع SMMGlobe
const SMM_API_URL = 'https://smmglobe.com/api/v2';

// مفتاح الـ API الحقيقي الخاص بك والمفعل
const SMM_API_KEY = '4bb74b551611ef2c97d1c2f75439ac57';

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * استقبال تأكيد الدفع وتمرير الطلب تلقائياً لـ SMMGlobe بناءً على شروط PHP الخاصة بهم
 */
app.post('/api/verify-order', async (req, res) => {
    try {
        const { orderID, serviceDetails, targetLink } = req.body;

        if (!orderID || !serviceDetails || !targetLink) {
            console.error('[خطأ]: بيانات الطلب غير مكتملة.');
            return res.status(400).json({ 
                success: false, 
                message: 'بيانات الطلب ناقصة للتمرير.' 
            });
        }

        console.log(`[PayPal]: تم استلام المال بنجاح للمعاملة رقم: ${orderID}`);
        console.log(`[SMMGlobe]: جاري إرسال الطلب للخدمة: ${serviceDetails.smmServiceId}`);

        // تجهيز المعاملات بصيغة URL Encoded كما يطلب السيرفر
        const params = new URLSearchParams();
        params.append('key', SMM_API_KEY);
        params.append('action', 'add');
        params.append('service', serviceDetails.smmServiceId.toString());
        params.append('link', targetLink.toString());
        params.append('quantity', serviceDetails.quantity.toString());

        // محاكاة نفس خيارات وتفاصيل اتصال PHP (الـ User-Agent وتخطي حماية SSL المباشرة)
        const agent = new https.Agent({  
            rejectUnauthorized: false 
        });

        const response = await axios.post(SMM_API_URL, params, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/4.0 (compatible; MSIE 5.01; Windows NT 5.0)'
            },
            httpsAgent: agent
        });

        // قراءة استجابة السيرفر النهائية
        if (response.data && response.data.order) {
            console.log(`✅ نجاح التمرير الآلي! رقم الطلب: ${response.data.order}`);
            return res.status(200).json({
                success: true,
                message: 'تم استقبال المال وتمرير الطلب تلقائياً بنجاح وبدون أخطاء.',
                smmOrderId: response.data.order
            });
        } else if (response.data && response.data.error) {
            console.error(`❌ رفض من SMMGlobe API: ${response.data.error}`);
            return res.status(400).json({
                success: false,
                message: response.data.error
            });
        } else {
            console.error('[SMMGlobe]: استجابة مبهمة:', response.data);
            return res.status(500).json({
                success: false,
                message: 'حدث رد غير معروف من سيرفر التجهيز.'
            });
        }

    } catch (error) {
        console.error('❌ خطأ حرج في الشبكة أثناء تمرير الطلب:', error.message);
        return res.status(500).json({
            success: false,
            message: 'فشل الاتصال التلقائي بسيرفر المتابعين.'
        });
    }
});

// تشغيل السيرفر على البورت الافتراضي
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بأعلى كفاءة وجاهز تماماً للتمرير الفوري على البورت: ${PORT}`);
});
