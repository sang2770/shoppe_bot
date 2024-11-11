import fetch from "node-fetch";
import fs from "fs";
import TelegramBot from "node-telegram-bot-api";

let dataGlobal = [];
const TELEGRAM_BOT_TOKEN = '7764269270:AAEsbtWna0B0AEyB0zMZtnptZR2Zqu_HucU';
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const APIToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VybmFtZSI6InNhbmcyNzcwIiwiQ29taWQiOm51bGwsIlJvbGVpZCI6bnVsbCwiaXNzIjoidG1hcGkiLCJzdWIiOiJzYW5nMjc3MCIsImF1ZCI6WyIiXSwiaWF0IjoxNzMxMjk0MjM1fQ.cof76I9p0EmqGPJ1wtXt0Y5ryto0I2UYEFX-mLPq0RU'; // Thay bằng token của bạn

// Hàm tính tổng số lượng hàng từ các skus
function calculateTotalStock(productData) {
    if (productData.stock && productData.stock > 0) {
        return productData.stock;
    }
    const skus = productData.skus;
    return skus ? skus.reduce((total, sku) => total + (sku.stock || 0), 0) : 0;
}

// Hàm gọi API để lấy thông tin sản phẩm
async function fetchProductDetails(url) {
    try {
        const response = await fetch(`http://api.tmapi.top/shopee/item_detail_by_url?apiToken=${APIToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });
        const data = await response.json();
        console.log(data);
        
        if (data.code !== 200 || !data.data) throw new Error("Không lấy được thông tin sản phẩm");

        const stock = calculateTotalStock(data.data);
        return {
            name: data.data.title,
            url: url,
            stock: stock
        };
    } catch (error) {
        console.error("Có lỗi khi gọi API:", error);
        return null;
    }
}

// Hàm cập nhật `dataGlobal` và lưu vào file JSON
function updateDataGlobal() {
    fs.writeFileSync('./data.json', JSON.stringify(dataGlobal, null, 2));
}

// Hàm kiểm tra trạng thái và gửi thông báo qua Telegram
async function checkProductStatus(url, chatId) {
    const productDetails = await fetchProductDetails(url);
    if (productDetails) {
        const { name, stock, url } = productDetails;
        const originalData = dataGlobal.find(item => item.url === url && item.chatId === chatId);

        // Nếu chưa có trong dataGlobal, thêm mới
        if (!originalData) {
            dataGlobal.push({ ...productDetails, chatId });
            updateDataGlobal();
        } else if (originalData.stock === stock) {
            // Không có thay đổi về số lượng hàng, không làm gì
            return;
        } else {
            // Cập nhật khi có thay đổi về trạng thái hàng hóa
            originalData.stock = stock;
            updateDataGlobal();
        }

        if (stock > 0) {
            bot.sendMessage(chatId, `Sản phẩm "${name}" đã có hàng với số lượng: ${stock}. Xem chi tiết tại: ${url}`);
        } else {
            bot.sendMessage(chatId, `Sản phẩm "${name}" hiện đang hết hàng.`);
        }
        return true;
    } else {
        console.warn("Không lấy được thông tin sản phẩm.");
        return false;
    }
}

// Lắng nghe tin nhắn từ người dùng trên Telegram
bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text.startsWith("http")) {
        bot.sendMessage(chatId, "Đang kiểm tra tình trạng sản phẩm...");
        // Thiết lập kiểm tra định kỳ với khoảng thời gian dài hơn, ví dụ 10 phút (600000 ms)
        const check = checkProductStatus(text, chatId);
        if (check) {
            setInterval(() => {
                checkProductStatus(text, chatId);
            }, 300000); // Mỗi 5 phút
        }
    } else {
        bot.sendMessage(chatId, "Vui lòng gửi URL sản phẩm Shopee.");
    }
});

// Khởi tạo từ file data.json nếu tồn tại
try {
    const savedData = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
    if (Array.isArray(savedData)) {
        dataGlobal = savedData;
        dataGlobal.forEach(item => {
            const check = checkProductStatus(item.url, item.chatId);
            if (check) {
                setInterval(() => {
                    checkProductStatus(item.url, item.chatId);
            }, 300000); // Mỗi 5 phút
            }
        });
    }
} catch (error) {
    console.error(`Có lỗi khi khởi tạo từ file data.json: ${error}`);
}
bot.deleteWebHook()
    .then(() => {
        console.log("Webhook deleted successfully.");
    })
    .catch((err) => {
        console.error("Error deleting webhook: ", err);
    });