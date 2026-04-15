using db_schema from '../db/data-model';

service ProductService {
    entity Products as projection on db_schema.Products;
    
    entity Suppliers as projection on db_schema.Suppliers;
}
