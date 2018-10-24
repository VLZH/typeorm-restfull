import {
    Column,
    Entity,
    JoinColumn,
    JoinTable,
    ManyToMany,
    ManyToOne,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn
} from "typeorm";

@Entity()
class Model {
    @PrimaryGeneratedColumn() public id: number;
    @Column() public str: string;
    @JoinColumn()
    @Column(type => OneToOneModel)
    public onetoone: OneToOneModel;
    @OneToMany(type => ManyToOneModel, many_item => many_item.model)
    public many_items: [ManyToOneModel];
    @ManyToMany(type => ManyToManyModel, mtm_item => mtm_item.mtm_items)
    @JoinTable()
    public mtm_items: [ManyToManyModel];
}

@Entity()
class OneToOneModel {
    @PrimaryGeneratedColumn() public id: number;
    @OneToOne(type => Model)
    public model: Model;
}

@Entity()
class ManyToOneModel {
    @PrimaryGeneratedColumn() public id: number;
    @ManyToOne(type => Model)
    public model: Model;
}

@Entity()
class ManyToManyModel {
    @PrimaryGeneratedColumn() public id: number;
    @ManyToMany(type => ManyToManyModel, mtm_item => mtm_item.mtm_items)
    public mtm_items: [ManyToManyModel];
}
