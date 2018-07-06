export type RequestQuery = { [key: string]: string | number };

export default class RequestContext {
    public body: string | object;
    public query: RequestQuery;
    public params: { [key: string]: string | number }
    public path: string
}
