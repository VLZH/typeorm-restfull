export type ApiRequestType =
    | "DETAIL"
    | "LIST"
    | "PATCH_DETAIL"
    | "POST_DETAIL"
    | "DELETE_DETAIL";

export interface IRequestQuery {
    [key: string]: any;
}

export class RequestContext {
    public body?: object | string;
    public path: string;
    public params: {
        [key: string]: string;
    };
    public headers: {
        // headers
        [key: string]: any;
    };
    public query: IRequestQuery;
    public request_type: ApiRequestType;
    public original_context?: any;

    constructor(data: RequestContext, original_context: any) {
        this.body = data.body;
        this.path = data.path;
        this.params = data.params;
        this.headers = data.headers;
        this.query = data.query;
        this.request_type = data.request_type;
        this.original_context = original_context;
    }
}

export default RequestContext;
