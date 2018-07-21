import { Context } from "koa";
import Router, { IMiddleware } from "koa-router";
import { IApiResourceOptions } from "./ApiResourceOptions";
import BaseApiResource, {
    IHandlerResponse,
    IResourceLogger
} from "./BaseApiResource";

export interface IKoaApiResourceOptions<Entity>
    extends IApiResourceOptions<Entity> {
    base_url?: string;
}

export default class KoaApiResource<Entity> extends BaseApiResource<Entity> {
    public router: Router;
    public base_url?: string;
    constructor(
        model: new () => Entity,
        options: IKoaApiResourceOptions<Entity>,
        router: Router,
        logger?: IResourceLogger
    ) {
        super(model, options, logger);
        this.router = router;
        this.base_url = options.base_url;
        this.setupRoutes();
    }

    public routes(): IMiddleware {
        return this.router.routes();
    }

    /**
     * Wrap a handler for flexibylity
     */
    private wrapHandler(
        handler: (ctx: Context) => Promise<IHandlerResponse>
    ): (ctx: Context, next: () => void) => Promise<void> {
        handler = handler.bind(this);
        return async (ctx: Context, next: () => void) => {
            const handlerResult = await handler(ctx);
            ctx.body = handlerResult.body;
            ctx.status = handlerResult.status;
            next();
        };
    }

    private setupRoutes(): void {
        const wh = this.wrapHandler.bind(this);
        this.router
            .get("/", wh(this.getList))
            .get("/:id", wh(this.getDetail))
            .post("/", wh(this.postDetail))
            .patch("/:id", wh(this.patchDetail))
            .delete("/:id", wh(this.deleteDetail));
    }

    public reverseEndpointUrl(): string {
        const get_list_stack = this.router.stack.find(
            s => s.paramNames.length === 0 && s.methods.includes("GET")
        );
        const path = get_list_stack ? get_list_stack.path : "";
        return `${this.base_url || ""}${path}`;
    }
}

export { KoaApiResource };
