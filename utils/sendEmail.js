const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, html, pdfPath) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "vijayprajapati1410@gmail.com",
        pass: "dusp mltq yjdg ladb", // Replace with a valid App Password
      },
    });

    const mailOptions = {
      from: '"ElectroHub" <vijayprajapati1410@gmail.com>',
      to,
      subject,
      html,
      attachments: [
        {
          filename: "Invoice.pdf",
          path: pdfPath,
          contentType: "application/pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully with attached PDF!");
  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
};

module.exports = sendEmail;
