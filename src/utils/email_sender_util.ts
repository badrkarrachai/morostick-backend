import nodemailer from "nodemailer";
import config from "../config"; // Assume you have a config file with email settings
import { readHtmlTemplate } from "./read_html_util";
import { IUser } from "../interfaces/user_interface";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Create a transporter
const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure, // true for 465, false for other ports
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    // Send mail with defined transport object
    const info = await transporter.sendMail({
      from: `"${config.email.appName}" <${config.email.user}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Email could not be sent");
  }
};

// Send welcome email to the user
export async function sendWelcomeEmail(user: IUser) {
  let htmlTemplate = readHtmlTemplate("welcome_to.html");
  htmlTemplate = htmlTemplate.replace("{{NAME}}", user.name);

  sendEmail({
    to: user.email,
    subject: `Welcome to ${config.app.appName}!`,
    html: htmlTemplate,
    text: "",
  });
}
