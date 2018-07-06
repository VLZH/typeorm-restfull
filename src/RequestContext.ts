import { Context } from "koa";

export interface IRequestQuery = { [key: string]: string | number };
export interface IKoaRequesContext extends Context {}
export type RequestContext = IKoaRequesContext;

export default RequestContext;
