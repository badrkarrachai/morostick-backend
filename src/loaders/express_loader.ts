import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import config from "../config";
import indexRouter from "../routes";
import {
  notFoundHandler,
  globalErrorHandler,
} from "../routes/middlewares/errors_middleware";
import type { Express } from "express";
import path from "path";
import cookieParser from "cookie-parser";

export default async function ({ app }: { app: Express }) {
  // Status checkpoints
  app.get("/status", (req, res) => res.sendStatus(200).end());
  app.head("/status", (req, res) => res.sendStatus(200).end());

  // Reveal real origin IP behind reverse proxies
  app.set("trust proxy", false);

  // Middlewares
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(cookieParser());
  app.use(
    cors({
      origin: "*",
      methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
      preflightContinue: false,
      optionsSuccessStatus: 204,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(morgan(config.logs.morgan));

  // Serve static files from the 'uploads' directory
  app.use(
    `${config.app.apiPrefix}/images`,
    express.static(path.join(__dirname, "../uploads"))
  );

  // Routes
  app.use(config.app.apiPrefix, indexRouter);

  // Error handlers
  app.use(notFoundHandler);
  app.use(globalErrorHandler);
}
