const nodemailer = require("nodemailer");

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function dataUrlToAttachment(dataUrl, filename) {
  if (!dataUrl) return null;
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  return {
    filename,
    content: Buffer.from(match[2], "base64"),
    contentType: match[1],
  };
}

module.exports = { getTransporter, dataUrlToAttachment };
