import dotenv from "dotenv";
dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3000),
  whatsapp: {
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "verify_token_teste"
  },
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_DATABASE || "whatsapp_atendimento"
  }
};
