import { SelectQueryBuilder } from "typeorm";
import queryString from "query-string";
import { RequestQuery } from "./RequestContext";

export default class ApiListResponse<Entity> {
    public meta: {
        count: number;
        offset: number;
        limit: number;
        total: number;
        next?: string;
        prev?: string;
    };
    public objects: any[];

    constructor(
        objects: Entity[],
        qb: SelectQueryBuilder<Entity>,
        total: number,
        count: number,
        request_query: RequestQuery,
        endpoint_url: string
    ) {
        // this.meta.count =
        this.meta = {
            limit: 0,
            offset: 0,
            total,
            count,
            ...this.buildMetaFromQB(qb, request_query, endpoint_url)
        };
        this.objects = objects;
    }

    private buildMetaFromQB(
        qb: SelectQueryBuilder<Entity>,
        query: Object,
        endpoint_url: string
    ) {
        const offset = qb.expressionMap.skip || 0;
        const limit = qb.expressionMap.take || 0;
        let next_q;
        if (this.meta.total > offset + (limit || 0)) {
            next_q = queryString.stringify({
                ...query,
                offset: offset + limit
            });
        }
        return {
            limit,
            next: next_q ? `${endpoint_url}?${next_q}` : null,
            offset
        };
    }
}
