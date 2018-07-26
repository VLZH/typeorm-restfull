# How to use?

```javascript
// model.ts

abstract class BaseModel {
    public static updatableFields: string[] = [];
    public static privateFields: string[] = [];
    public static notUpdatableFields: string[] = [];
    @PrimaryGeneratedColumn() public id?: number;
    @CreateDateColumn({ type: "timestamp" })
    public createdAt?: Date;
    @UpdateDateColumn({ type: "timestamp" })
    public updatedAt?: Date;
    constructor(data?: BModel) {
        if (data) {
            this.id = data.id;
        }
    }
}

export class TourService extends BaseModel {
    @Column({ length: 200 })
    public title?: string;
    @ManyToMany(type => Tour, tour => tour.services)
    public tours?: Tour[];

    constructor(data?: { title: string; tours: Tour[] }) {
        super();
        if (data) {
            this.title = data.title;
            this.tours = data.tours;
        }
    }
}
```

Create resource and add routes to KoaRouter (package: koa-router)

```javascript
import { KoaApiResource } from "typeorm-restfull";
import Router from "koa-router";
import createLogger from "../../logger"; // custom logger

const logger = createLogger("tour_services:routes");

const tourServiceRouter = new Router({
    prefix: "/tour_services"
});

const tourServiceResource = new KoaApiResource(
    TourService,
    {
        // for absolute path in uri to next/previous page on getting a list items
        base_url: config.site.base_url,
        // function for getting body from koa/Context
        bodyExtractor: ctx => ctx.request.body
        
        /*
        AVAILABLE OPTIONS:
        // hooks
        afterDelete?: (ctx: RequestContext, deleted_item: DeleteResult) => void;
        preDetail?: IPreGetCallback<Entity>;
        afterDetail?: (ctx: RequestContext, item: Entity) => Promise<Entity>;
        preList?: IPreGetCallback<Entity>;
        afterList?: (ctx: RequestContext, items: Entity[]) => Promise<Entity[]>;
        prePatch?: IPreInsertCallback<Entity>;
        afterPatch?: IAfterInsertCallback<Entity>;
        prePost?: IPreInsertCallback<Entity>;
        afterPost?: IAfterInsertCallback<Entity>;
        
        filter?: () => void;
        take?: number;
        list_fields?: string[];
        relations?: string[];
        select?: string[];
        order?: { [P in keyof T]?: "DESC" | "ASC" };
        */
    },
    tourServiceRouter,
    logger
);
```

## Response example
```sh
> curl http://example.com/tour_services
```
```json
{
    meta: {
        "count": 10,
        "limit": 10,
        "offset": 0,
        "total": 27,
        "next": "/api/tour_services/?offset=10"
    },
    objects: [...]
}
```

# TODO

1.  Check correct work of preparing data for post/patch
2.  More examples and documentation
3.  Ordering
4.  Resource for Express