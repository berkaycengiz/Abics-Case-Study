using db_schema from '../db/data-model';

service ProductService {
    @odata.draft.enabled
    entity Products as projection on db_schema.Products;
    
    @odata.draft.enabled
    entity Suppliers as projection on db_schema.Suppliers;
}