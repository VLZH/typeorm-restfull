import { Context } from "koa";

export type IRequestQuery = {
    [key: string]: string;
};
export interface IKoaRequesContext extends Context {}
export type RequestContext = IKoaRequesContext;

export default RequestContext;
