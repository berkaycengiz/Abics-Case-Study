namespace db_schema;

using { cuid, managed, Currency, Country } from '@sap/cds/common';

entity Products: cuid, managed {
    name: String(100) @mandatory;
    description: String(250);
    price: Decimal(15,2);
    currency: Currency @mandatory;
    stocks: Integer;
    supplier: Association to Suppliers @mandatory;
}

entity Suppliers : cuid, managed {
    name: String(100) @mandatory;
    city: String(100);
    country: Country;
    email: String(255) @assert.format: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$';
    address: String(250);
    phone: String(50);
    products: Association to many Products on products.supplier = $self;
}