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
    public query: {
        // Get params
        [key: string]: any;
    };
    public original_context?: any;

    constructor(data: RequestContext, original_context: any) {
        this.body = data.body;
        this.path = data.path;
        this.params = data.params;
        this.headers = data.headers;
        this.query = data.query;
        this.original_context = original_context;
    }
}

export default RequestContext;
