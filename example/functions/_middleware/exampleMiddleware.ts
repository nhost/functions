import { Request,Response,NextFunction } from "express";

// Middleware function
export default async function exampleMiddleware(req: Request, res: Response, next: NextFunction) {
  console.log("This endpoint is using middleware!")
  next()
}

// Routes that the middleware should be applied to
export const routes = ['/sub']