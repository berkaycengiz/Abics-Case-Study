const cds = require("@sap/cds");

module.exports = cds.service.impl(async function (srv) {
    const { Products, Suppliers, Currencies } = this.entities;


    srv.on("validateProductsCsv", async (req) => {
        const { csvContent } = req.data;

        if (!csvContent) {
            return { valid: false, errors: [{ row: 0, column: "", message: "CSV content is empty." }] };
        }

        const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== "");
        const errors = [];

        if (lines.length < 2) {
            return { valid: false, errors: [{ row: 0, column: "", message: "CSV must have a header row and at least one data row." }] };
        }

        const requiredColumns = ["name", "currency_code", "supplier_id"];
        const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));


        for (const col of requiredColumns) {
            if (!header.includes(col)) {
                errors.push({ row: 0, column: col, message: `Missing required column: "${col}"` });
            }
        }

        if (errors.length > 0) {
            return { valid: false, errors };
        }

        const nameIdx        = header.indexOf("name");
        const priceIdx       = header.indexOf("price");
        const currencyIdx    = header.indexOf("currency_code");
        const supplierIdx    = header.indexOf("supplier_id");
        const stocksIdx      = header.indexOf("stocks");


        const aSuppliers = await SELECT.from(Suppliers).columns("ID");
        const validSupplierIDs = new Set(aSuppliers.map(s => s.ID));

        const aCurrencies = await SELECT.from(Currencies).columns("code");
        const validCurrencies = new Set(aCurrencies.map(c => c.code));

        for (let i = 1; i < lines.length; i++) {
            const rowNum = i + 1;
            const cols   = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));

            const name       = nameIdx     >= 0 ? cols[nameIdx]     : null;
            const price      = priceIdx    >= 0 ? cols[priceIdx]    : null;
            const currency   = currencyIdx >= 0 ? cols[currencyIdx] : null;
            const supplierID = supplierIdx >= 0 ? cols[supplierIdx] : null;
            const stocks     = stocksIdx   >= 0 ? cols[stocksIdx]   : null;

            if (!name || name === "") {
                errors.push({ row: rowNum, column: "name", message: "Name is required." });
            }
            if (price !== null && price !== undefined && price !== "") {
                if (isNaN(parseFloat(price)) || parseFloat(price) < 0) {
                    errors.push({ row: rowNum, column: "price", message: "Price cannot be negative." });
                }
            }
            if (!currency || currency === "") {
                errors.push({ row: rowNum, column: "currency_code", message: "Currency code is required." });
            } else if (!validCurrencies.has(currency)) {
                errors.push({ row: rowNum, column: "currency_code", message: `Currency code "${currency}" is invalid.` });
            }
            if (!supplierID || supplierID === "") {
                errors.push({ row: rowNum, column: "supplier_ID", message: "Supplier ID is required." });
            } else if (!validSupplierIDs.has(supplierID)) {
                errors.push({ row: rowNum, column: "supplier_ID", message: `Supplier ID "${supplierID}" does not exist.` });
            }
            if (stocks !== null && stocks !== undefined && stocks !== "") {
                const iStocks = parseInt(stocks);
                if (isNaN(iStocks) || iStocks < 0) {
                    errors.push({ row: rowNum, column: "stocks", message: "Stocks must be a valid integer." });
                }
            }
        }

        return { valid: errors.length === 0, errors };
    });


    srv.on("uploadProductsCsv", async (req) => {
        const { csvContent } = req.data;

        if (!csvContent) {
            return req.error(400, "CSV content is empty.");
        }

        const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== "");
        if (lines.length < 2) {
            return req.error(400, "CSV must have at least one data row.");
        }

        const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));

        const nameIdx        = header.indexOf("name");
        const descIdx        = header.indexOf("description");
        const priceIdx       = header.indexOf("price");
        const currencyIdx    = header.indexOf("currency_code");
        const stocksIdx      = header.indexOf("stocks");
        const supplierIdx    = header.indexOf("supplier_id");

        let created = 0;
        let errors  = 0;

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));

            try {
                const newProduct = {
                    ID          : cds.utils.uuid(),
                    name        : nameIdx    >= 0 ? cols[nameIdx]        : "",
                    description : descIdx    >= 0 ? cols[descIdx]        : "",
                    price       : priceIdx   >= 0 && cols[priceIdx] ? parseFloat(cols[priceIdx]) : null,
                    currency_code : currencyIdx >= 0 ? cols[currencyIdx] : "",
                    stocks      : stocksIdx  >= 0 ? parseInt(cols[stocksIdx]) || 0 : 0,
                    supplier_ID : supplierIdx >= 0 ? cols[supplierIdx]   : null
                };

                await INSERT.into(Products).entries(newProduct);
                created++;
            } catch (err) {
                errors++;
            }
        }

        return { created, updated: 0, errors };
    });
});
