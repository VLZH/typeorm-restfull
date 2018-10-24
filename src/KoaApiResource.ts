import { Context } from "koa";
import Router, { IMiddleware } from "koa-router";
import { IApiResourceOptions } from "./ApiResourceOptions";
import RequestContext, { ApiRequestType } from "./RequestContext";
import BaseApiResource, {
    IHandlerResponse,
    IResourceLogger
} from "./BaseApiResource";
import { ObjectType } from "typeorm";

export type IBodyExtractor = (ctx: Context) => object | string | Array<any>;

export interface IKoaApiResourceOptions<Entity>
    extends IApiResourceOptions<Entity> {
    base_url?: string;
    bodyExtractor: IBodyExtractor;
}

export default class KoaApiResource<Entity> extends BaseApiResource<Entity> {
    public router: Router;
    public base_url?: string;
    public bodyExtractor: IBodyExtractor;

    constructor(
        model: ObjectType<Entity>,
        options: IKoaApiResourceOptions<Entity>,
        router: Router,
        logger?: IResourceLogger
    ) {
        super(model, options, logger);
        this.router = router;
        this.base_url = options.base_url;
        this.bodyExtractor = options.bodyExtractor;
        this.setupRoutes();
    }

    public routes(): IMiddleware {
        return this.router.routes();
    }

    public reverseEndpointUrl(): string {
        const get_list_stack = this.router.stack.find(
            s => s.paramNames.length === 0 && s.methods.includes("GET")
        );
        const path = get_list_stack ? get_list_stack.path : "";
        return `${this.base_url || ""}${path}`;
    }

    /**
     * Wrap a handler for flexibylity
     */
    private wrapHandler(
        handler: (ctx: RequestContext) => Promise<IHandlerResponse>,
        request_type: ApiRequestType
    ): (ctx: Context, next: () => void) => Promise<void> {
        handler = handler.bind(this);
        return async (ctx: Context, next: () => void) => {
            const r_ctx = new RequestContext(
                {
                    body: this.bodyExtractor(ctx),
                    headers: ctx.headers,
                    params: ctx.params,
                    path: ctx.path,
                    query: ctx.query,
                    request_type
                },
                ctx
            );
            const handlerResult = await handler(r_ctx);
            ctx.body = handlerResult.body;
            ctx.status = handlerResult.status;
            next();
        };
    }

    private setupRoutes(): void {
        this.router
            .get("/", this.wrapHandler(this.getList, "LIST"))
            .get("/:id", this.wrapHandler(this.getDetail, "DETAIL"))
            .post("/", this.wrapHandler(this.postDetail, "POST_DETAIL"))
            .patch("/:id", this.wrapHandler(this.patchDetail, "PATCH_DETAIL"))
            .delete(
                "/:id",
                this.wrapHandler(this.deleteDetail, "DELETE_DETAIL")
            );
    }
}

export { KoaApiResource };
