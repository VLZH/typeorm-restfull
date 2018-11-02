import queryString from "query-string";
import { SelectQueryBuilder } from "typeorm";
import { IRequestQuery } from "./RequestContext";

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
        request_query: IRequestQuery,
        endpoint_url: string
    ) {
        this.meta = {
            count,
            limit: 0,
            offset: 0,
            total,
            ...this.buildMetaFromQB(qb, total, request_query, endpoint_url)
        };
        this.objects = objects;
    }

    private buildMetaFromQB(
        qb: SelectQueryBuilder<Entity>,
        total: number,
        query: object,
        endpoint_url: string
    ) {
        const offset = qb.expressionMap.skip || 0;
        const limit = qb.expressionMap.take || 0;
        let next_q;
        if (total > offset + (limit || 0)) {
            next_q = queryString.stringify({
                ...query,
                offset: offset + limit
            });
        }
        return {
            limit,
            next: next_q ? `${endpoint_url}?${next_q}` : undefined,
            offset
        };
    }
}
