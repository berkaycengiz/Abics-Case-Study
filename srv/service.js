const cds = require("@sap/cds");

module.exports = cds.service.impl(async function (srv) {
    const { Products, Suppliers, Currencies } = this.entities;

    srv.on("validateProductsCsv", async (req) => {
        try {
            const { csvContent } = req.data;
            const errors = [];

            if (!csvContent) {
                return { valid: false, errors: [{ row: 0, column: "", message: "CSV content is empty." }] };
            }

            const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== "");
            
            if (lines.length < 2) {
                return { valid: false, errors: [{ row: 0, column: "", message: "CSV must have a header and at least one row." }] };
            }

            const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));
            const requiredColumns = ["name", "currency_code", "supplier_id"];

            for (const col of requiredColumns) {
                if (!header.includes(col)) {
                    errors.push({ row: 0, column: col, message: `Missing required column: "${col}"` });
                }
            }

            if (errors.length > 0) {
                return { valid: false, errors };
            }

            const aSuppliers = await SELECT.from(Suppliers).columns("ID");
            const validSupplierIDs = new Set(aSuppliers.map(s => s.ID));
            const aCurrencies = await SELECT.from(Currencies).columns("code");
            const validCurrencies = new Set(aCurrencies.map(c => c.code));

            const nameIdx = header.indexOf("name");
            const priceIdx = header.indexOf("price");
            const currencyIdx = header.indexOf("currency_code");
            const supplierIdx = header.indexOf("supplier_id");
            const stocksIdx = header.indexOf("stocks");

            for (let i = 1; i < lines.length; i++) {
                const rowNum = i + 1;
                const currentLine = lines[i];
                if (!currentLine || currentLine.trim() === "") continue;

                const cols = currentLine.split(",").map(c => c ? c.trim().replace(/^"|"$/g, "") : "");

                const name = (nameIdx >= 0 && cols[nameIdx]) ? cols[nameIdx] : null;
                const price = (priceIdx >= 0 && cols[priceIdx]) ? cols[priceIdx] : null;
                const currency = (currencyIdx >= 0 && cols[currencyIdx]) ? cols[currencyIdx] : null;
                const supplierID = (supplierIdx >= 0 && cols[supplierIdx]) ? cols[supplierIdx] : null;
                const stocks = (stocksIdx >= 0 && cols[stocksIdx]) ? cols[stocksIdx] : null;

                if (!name) errors.push({ row: rowNum, column: "name", message: "Name is required." });

                if (price && (isNaN(parseFloat(price)) || parseFloat(price) < 0)) {
                    errors.push({ row: rowNum, column: "price", message: "Price must be a positive number." });
                }

                if (!currency) {
                    errors.push({ row: rowNum, column: "currency_code", message: "Currency is required." });
                } else if (!validCurrencies.has(currency)) {
                    errors.push({ row: rowNum, column: "currency_code", message: `Invalid currency: ${currency}` });
                }

                if (!supplierID) {
                    errors.push({ row: rowNum, column: "supplier_id", message: "Supplier ID is required." });
                } else if (!validSupplierIDs.has(supplierID)) {
                    errors.push({ row: rowNum, column: "supplier_id", message: `Supplier ID "${supplierID}" not found.` });
                }

                if (stocks && (isNaN(parseInt(stocks)) || parseInt(stocks) < 0)) {
                    errors.push({ row: rowNum, column: "stocks", message: "Stocks must be a positive integer." });
                }
            }

            return { valid: errors.length === 0, errors };
        } catch (err) {
            return { valid: false, errors: [{ row: 0, column: "", message: "Validation crashed: " + err.message }] };
        }
    });

    srv.on("uploadProductsCsv", async (req) => {
        const { csvContent } = req.data;
        if (!csvContent) return req.error(400, "CSV is empty.");

        const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== "");
        const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));

        const indices = {
            name: header.indexOf("name"),
            desc: header.indexOf("description"),
            price: header.indexOf("price"),
            curr: header.indexOf("currency_code"),
            stock: header.indexOf("stocks"),
            supp: header.indexOf("supplier_id")
        };

        try {
            const toInsert = lines.slice(1).map(line => {
                const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
                return {
                    ID: cds.utils.uuid(),
                    name: (indices.name >= 0 && cols[indices.name]) ? cols[indices.name] : "",
                    description: (indices.desc >= 0 && cols[indices.desc]) ? cols[indices.desc] : "",
                    price: (indices.price >= 0 && cols[indices.price]) ? parseFloat(cols[indices.price]) : 0,
                    currency_code: (indices.curr >= 0 && cols[indices.curr]) ? cols[indices.curr] : "",
                    stocks: (indices.stock >= 0 && cols[indices.stock]) ? parseInt(cols[indices.stock]) || 0 : 0,
                    supplier_ID: (indices.supp >= 0 && cols[indices.supp]) ? cols[indices.supp] : null
                };
            });

            if (toInsert.length > 0) await INSERT.into(Products).entries(toInsert);
            return { created: toInsert.length, errors: 0 };
        } catch (err) {
            return req.error(400, "Upload failed: " + err.message);
        }
    });

    srv.on("validateSuppliersCsv", async (req) => {
        try {
            const { csvContent } = req.data;
            const errors = [];
            if (!csvContent) return { valid: false, errors: [{ row: 0, message: "Empty CSV" }] };

            const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== "");
            const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));

            if (!header.includes("name")) {
                return { valid: false, errors: [{ row: 0, column: "name", message: "Missing name column" }] };
            }

            const nameIdx = header.indexOf("name");
            const emailIdx = header.indexOf("email");

            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
                if (!cols[nameIdx]) errors.push({ row: i + 1, column: "name", message: "Name is required" });

                if (emailIdx >= 0 && cols[emailIdx]) {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(cols[emailIdx])) errors.push({ row: i + 1, column: "email", message: "Invalid email format" });
                }
            }
            return { valid: errors.length === 0, errors };
        } catch (err) {
            return { valid: false, errors: [{ row: 0, message: err.message }] };
        }
    });

    srv.on("uploadSuppliersCsv", async (req) => {
        const { csvContent } = req.data;
        const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== "");
        const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));

        const indices = {
            name: header.indexOf("name"),
            email: header.indexOf("email"),
            phone: header.indexOf("phone"),
            address: header.indexOf("address"),
            city: header.indexOf("city"),
            country: header.indexOf("country_code") >= 0 ? header.indexOf("country_code") : header.indexOf("country")
        };

        try {
            const toInsert = lines.slice(1).map(line => {
                const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
                return {
                    ID: cds.utils.uuid(),
                    name: (indices.name >= 0 && cols[indices.name]) ? cols[indices.name] : "",
                    email: (indices.email >= 0 && cols[indices.email]) ? cols[indices.email] : null,
                    phone: (indices.phone >= 0 && cols[indices.phone]) ? cols[indices.phone] : null,
                    address: (indices.address >= 0 && cols[indices.address]) ? cols[indices.address] : null,
                    city: (indices.city >= 0 && cols[indices.city]) ? cols[indices.city] : null,
                    country_code: (indices.country >= 0 && cols[indices.country]) ? cols[indices.country].substring(0, 3) : null
                };
            });

            await INSERT.into(Suppliers).entries(toInsert);
            return { created: toInsert.length };
        } catch (err) {
            console.error("Upload Suppliers CSV Error:", err);
            return req.error(400, "Upload failed: " + err.message);
        }
    });
});