export type RequestQuery = { [key: string]: string | number };
import { Context } from "koa";

export interface IKoaRequesContext extends Context {}

export type RequestContext = IKoaRequesContext;

export default RequestContext;

// export default class RequestContext {
//     public body: string | { [key: string]: string };
//     public query: RequestQuery;
//     public params: { [key: string]: string | number };
//     public path: string;
//     public state: any;
//     [key: string]: any;
//     constructor(data: RequestContext) {
//         this.body = data.body;
//         this.query = data.query;
//         this.params = data.params;
//         this.path = data.path;
//     }
// }
