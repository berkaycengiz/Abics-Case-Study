using db_schema from '../db/data-model';
using sap from '@sap/cds/common';

service ProductService {
    entity Products as projection on db_schema.Products;
    entity Suppliers as projection on db_schema.Suppliers;
    @readonly
    entity Currencies as projection on sap.common.Currencies;


    action validateProductsCsv(csvContent: LargeString) returns {
        valid   : Boolean;
        errors  : array of {
            row     : Integer;
            column  : String;
            message : String;
        };
    };

    action uploadProductsCsv(csvContent: LargeString) returns {
        created : Integer;
        updated : Integer;
        errors  : Integer;
    };
}
