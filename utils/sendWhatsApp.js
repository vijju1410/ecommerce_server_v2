const twilio = require("twilio");
const fs = require("fs");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = new twilio(accountSid, authToken);

const sendWhatsAppMessage = async (to, message, pdfPath) => {
    try {
        // Read PDF file as base64
        const pdfData = fs.readFileSync(pdfPath).toString("base64");

        // Send message with media
        const response = await client.messages.create({
            from: "whatsapp:+14155238886", // Twilio Sandbox Number
            to: `whatsapp:${to}`, // User's WhatsApp number
            body: message,
            mediaUrl: `data:application/pdf;base64,${pdfData}`, // Attach PDF
        });

        console.log("✅ WhatsApp message sent:", response.sid);
    } catch (error) {
        console.error("❌ Error sending WhatsApp message:", error);
    }
};

module.exports = sendWhatsAppMessage;
