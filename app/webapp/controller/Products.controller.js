sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/f/library",
    "sap/base/strings/formatMessage"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, fioriLibrary, formatMessage) {
    "use strict";

    return Controller.extend("com.abics.casestudy.controller.Products", {
        onInit: function () {
            this._oUIModel = new JSONModel({
                layout: "OneColumn",
                count: 0,
                hasSelection: false,
                hasPendingChanges: false,
                hasActiveFilters: false,
                editingRows: [],
                allSelected: false,
                sortColumn: "createdAt",
                sortDescending: true,
                isInlineEditing: false
            });
            this.getView().setModel(this._oUIModel, "products");

            this._oODataModel = this.getOwnerComponent().getModel();

            this._oFilterDialog = null;
            this._oCsvDialog = null;

            this._aSorters = [];
            this._aFilters = [];
            this._aSearchFilters = [];
            this._aActiveFilterTokens = [];

            this._loadCurrencies();
            this._loadSuppliers();

            this._oODataModel.attachPropertyChange(this._onModelChange, this);
        },

        onExit: function () {
            this._oODataModel.detachPropertyChange(this._onModelChange, this);
        },

        _onModelChange: function () {
            const bHas = this._oODataModel.hasPendingChanges("productsGroup");
            const aEditingRows = this._oUIModel.getProperty("/editingRows") || [];
            this._oUIModel.setProperty("/hasPendingChanges", bHas || aEditingRows.length > 0);
            this._oUIModel.setProperty("/isInlineEditing", aEditingRows.length > 0);
        },

        _loadSuppliers: function () {
            const oListBinding = this._oODataModel.bindList("/Suppliers", null, [], [], {
                $select: "ID,name"
            });
            oListBinding.requestContexts(0, 500).then((aContexts) => {
                const aSuppliers = aContexts.map(c => c.getObject());
                this._oUIModel.setProperty("/suppliers", aSuppliers);

                // For filter dialog, prepend 'All Suppliers' option
                const aFilterSuppliers = [...aSuppliers];
                aFilterSuppliers.unshift({ ID: "", name: this._i18n("allSuppliers") });
                this._oUIModel.setProperty("/filterSuppliers", aFilterSuppliers);
            }).catch((oErr) => {
                console.error("Failed to load suppliers", oErr);
            });
        },

        _loadCurrencies: function () {
            const oListBinding = this._oODataModel.bindList("/Currencies", null, [], [], {
                $select: "code,name"
            });
            oListBinding.requestContexts(0, 500).then((aContexts) => {
                const aCurrencies = aContexts.map(c => c.getObject());
                this._oUIModel.setProperty("/currencies", aCurrencies);

                // For filter dialog, prepend 'All Currencies' option
                const aFilterCurrencies = [...aCurrencies];
                aFilterCurrencies.unshift({ code: "", name: this._i18n("allCurrencies") });
                this._oUIModel.setProperty("/filterCurrencies", aFilterCurrencies);
            }).catch((oErr) => {
                console.error("Failed to load currencies", oErr);
            });
        },

        _getTable: function () {
            return this.byId("productsTable");
        },

        _getBinding: function () {
            return this._getTable().getBinding("items");
        },

        onSelectionChange: function () {
            const oTable = this._getTable();
            const aSelected = oTable.getSelectedItems();
            this._oUIModel.setProperty("/hasSelection", aSelected.length > 0);
        },

        onSelectAll: function (oEvent) {
            const bSelected = oEvent.getParameter("selected");
            const oTable = this._getTable();
            if (bSelected) {
                oTable.selectAll();
            } else {
                oTable.removeSelections(true);
            }
            this._oUIModel.setProperty("/hasSelection", bSelected);
        },

        onSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("newValue").trim();
            if (sQuery) {
                this._aSearchFilters = [new Filter({
                    filters: [
                        new Filter({ path: "name", operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false }),
                        new Filter({ path: "description", operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false })
                    ],
                    and: false
                })];
            } else {
                this._aSearchFilters = [];
            }
            this._applyFilters();
        },

        onSort: function (oEvent) {
            const oBtn = oEvent.getSource();
            const sColumn = oBtn.data("column");
            const sCurrentSort = this._oUIModel.getProperty("/sortColumn");
            const bCurrentDesc = this._oUIModel.getProperty("/sortDescending");

            let sNewColumn = sColumn;
            let bNewDescending = false;
            let aSorters = [];

            if (sCurrentSort === sColumn) {
                if (!bCurrentDesc) {
                    // 2. State: Ascending -> Descending
                    bNewDescending = true;
                    aSorters = [new Sorter(sColumn, true)];
                } else {
                    // 3. State: Descending -> None (Clear Sort)
                    sNewColumn = "";
                    bNewDescending = false;
                    // Empty array lets OData V4 fall back to the XML default (createdAt desc)
                    aSorters = [];
                }
            } else {
                // 1. State: New Column -> Ascending
                bNewDescending = false;
                aSorters = [new Sorter(sColumn, false)];
            }

            this._oUIModel.setProperty("/sortColumn", sNewColumn);
            this._oUIModel.setProperty("/sortDescending", bNewDescending);

            this._aSorters = aSorters;
            this._getBinding().sort(this._aSorters);
        },

        onDataReceived: function () {
            var oBinding = this._getBinding();
            if (oBinding) {
                var iCount = oBinding.getCount();
                this._oUIModel.setProperty("/count", iCount || 0);
            }
        },

        onOpenFilterDialog: function () {
            if (!this._oFilterDialog) {
                this._oFilterDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "com.abics.casestudy.view.fragment.ProductsFilterDialog",
                    this
                );
                this.getView().addDependent(this._oFilterDialog);
            }

            this._oFilterDialog.open();
        },

        onFilterConfirm: function () {
            const aFilters = [];
            const aTokens = [];

            // Currency filter
            const oCurrSelect = this.byId("currencyFilter");
            if (oCurrSelect && oCurrSelect.getSelectedKey()) {
                const sCurr = oCurrSelect.getSelectedKey();
                const sCurrText = oCurrSelect.getSelectedItem().getText();
                aFilters.push(new Filter("currency_code", FilterOperator.EQ, sCurr));
                aTokens.push({ key: "currency_code", text: this._i18n("currencyLabel") + ": " + sCurrText });
            }

            // Supplier filter
            const oSupplierSelect = this.byId("supplierFilter");
            if (oSupplierSelect && oSupplierSelect.getSelectedKey()) {
                const sSupp = oSupplierSelect.getSelectedKey();
                const sSuppName = oSupplierSelect.getSelectedItem().getText();
                aFilters.push(new Filter("supplier_ID", FilterOperator.EQ, sSupp));
                aTokens.push({ key: "supplier_ID", text: this._i18n("supplierLabel") + ": " + sSuppName });
            }

            // Price range filter
            const oPriceFrom = this.byId("priceFrom");
            const oPriceTo = this.byId("priceTo");
            var sPriceFromVal = oPriceFrom ? oPriceFrom.getValue() : "";
            var sPriceToVal = oPriceTo ? oPriceTo.getValue() : "";
            if (sPriceFromVal) {
                var fPriceFrom = parseFloat(sPriceFromVal);
                aFilters.push(new Filter("price", FilterOperator.GE, fPriceFrom));
            }
            if (sPriceToVal) {
                var fPriceTo = parseFloat(sPriceToVal);
                aFilters.push(new Filter("price", FilterOperator.LE, fPriceTo));
            }
            if (sPriceFromVal && sPriceToVal) {
                aTokens.push({ key: "price", text: this._i18n("priceRangeTemplate", [fPriceFrom, fPriceTo]) });
            } else if (sPriceFromVal) {
                aTokens.push({ key: "price", text: this._i18n("priceMin", [fPriceFrom]) });
            } else if (sPriceToVal) {
                aTokens.push({ key: "price", text: this._i18n("priceMax", [fPriceTo]) });
            }

            // Stock range filter
            const oStockFrom = this.byId("stocksFrom");
            const oStockTo = this.byId("stocksTo");
            var sStockFromVal = oStockFrom ? oStockFrom.getValue() : "";
            var sStockToVal = oStockTo ? oStockTo.getValue() : "";
            if (sStockFromVal) {
                var iStockFrom = parseInt(sStockFromVal, 10);
                aFilters.push(new Filter("stocks", FilterOperator.GE, iStockFrom));
            }
            if (sStockToVal) {
                var iStockTo = parseInt(sStockToVal, 10);
                aFilters.push(new Filter("stocks", FilterOperator.LE, iStockTo));
            }
            if (sStockFromVal && sStockToVal) {
                aTokens.push({ key: "stocks", text: this._i18n("stockRangeTemplate", [iStockFrom, iStockTo]) });
            } else if (sStockFromVal) {
                aTokens.push({ key: "stocks", text: this._i18n("stockMin", [iStockFrom]) });
            } else if (sStockToVal) {
                aTokens.push({ key: "stocks", text: this._i18n("stockMax", [iStockTo]) });
            }

            this._aFilters = aFilters;
            this._aActiveFilterTokens = aTokens;
            this._oUIModel.setProperty("/hasActiveFilters", aTokens.length > 0);
            this._renderFilterTokens(aTokens);
            this._applyFilters();
            this._oFilterDialog.close();
        },

        onFilterCancel: function () {
            this._oFilterDialog.close();
        },

        onClearAllFilters: function () {
            this._aFilters = [];
            this._aActiveFilterTokens = [];
            this._oUIModel.setProperty("/hasActiveFilters", false);
            this._renderFilterTokens([]);
            this._applyFilters();
        },

        _renderFilterTokens: function (aTokens) {
            const oTokensBox = this.byId("filterTokens");
            if (!oTokensBox) return;
            oTokensBox.destroyItems();
            aTokens.forEach(t => {
                oTokensBox.addItem(new sap.m.Token({ key: t.key, text: t.text, delete: this._onRemoveToken.bind(this) }));
            });
        },

        _onRemoveToken: function (oEvent) {
            const sKey = oEvent.getSource().getKey();
            this._aActiveFilterTokens = this._aActiveFilterTokens.filter(t => t.key !== sKey);
            this._aFilters = this._aFilters.filter(f => f.sPath !== sKey.replace("From", "").replace("To", "").replace("Min", ""));
            this._oUIModel.setProperty("/hasActiveFilters", this._aActiveFilterTokens.length > 0);
            this._renderFilterTokens(this._aActiveFilterTokens);
            this._applyFilters();
        },

        _applyFilters: function () {
            const aAllFilters = [...this._aSearchFilters, ...this._aFilters];
            if (aAllFilters.length > 0) {
                this._getBinding().filter(new Filter({ filters: aAllFilters, and: true }));
            } else {
                this._getBinding().filter([]);
            }
        },

        onAddRow: function () {
            const oBinding = this._getBinding();
            const sID = globalThis.crypto ? crypto.randomUUID() : Math.random().toString();
            const oContext = oBinding.create({
                ID: sID,
                name: "",
                description: "",
                price: 0,
                currency_code: "EUR",
                stocks: 0,
                supplier_ID: null
            }, false, false);

            const aEditingRows = this._oUIModel.getProperty("/editingRows") || [];
            this._oUIModel.setProperty("/editingRows", [...aEditingRows, sID]);
            this._onModelChange();
            this._oUIModel.refresh(true);

            const oTable = this._getTable();
            oTable.scrollToIndex(0);
        },

        onEditRow: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            if (!oContext) return;
            const sID = oContext.getProperty("ID");
            const aEditingRows = this._oUIModel.getProperty("/editingRows") || [];

            if (sID && !aEditingRows.includes(sID)) {
                this._oUIModel.setProperty("/editingRows", [...aEditingRows, sID]);
                this._onModelChange();
                this._oUIModel.refresh(true);
            }
        },

        onRowPress: function (oEvent) {
            console.log("[Products] onRowPress triggered!");
            const oSource = oEvent.getSource();
            let oContext = oSource.getBindingContext();

            // Sometime HBox/Button might not have direct context depending on UI5 version,
            // fallback to parent's binding context (ColumnListItem)
            if (!oContext && oSource.getParent) {
                const oParent = oSource.getParent();
                if (oParent && oParent.getBindingContext) {
                    oContext = oParent.getBindingContext();
                }
            }

            if (!oContext) {
                console.warn("[Products] No binding context found for clicked row.");
                return;
            }
            
            console.log("[Products] Context found:", oContext.getPath());

            const oFCL = this._getFCL();
            const oDetailView = this._getDetailView();

            if (oDetailView) {
                console.log("[Products] Refreshing Detail View binding...");
                // Just use the existing context from the table. 
                // OData V4 will automatically detect missing properties (like supplier/name) and fetch them smartly!
                oDetailView.setBindingContext(oContext);
            } else {
                console.error("[Products] Detail view not found by _getDetailView!");
            }

            if (oFCL) {
                console.log("[Products] Setting Layout to TwoColumnsBeginExpanded");
                oFCL.setLayout("TwoColumnsBeginExpanded");
            } else {
                console.error("[Products] FlexibleColumnLayout not found by _getFCL!");
            }
        },

        onOpenEditDialog: function (oEvent) {
            const oDetailView = this._getDetailView();
            const oContext = oDetailView ? oDetailView.getBindingContext() : null;
            
            if (!oContext) {
                MessageToast.show(this._i18n("noProductSelected"));
                return;
            }

            if (!this._oEditDialog) {
                this._oEditDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "com.abics.casestudy.view.fragment.ProductEditDialog",
                    this
                );
                // We add it to the detail view as a dependent so it inherits its model and binding context
                if (oDetailView) {
                    oDetailView.addDependent(this._oEditDialog);
                } else {
                    this.getView().addDependent(this._oEditDialog);
                }
            }
            
            this._oEditDialog.setBindingContext(oContext);
            this._oEditDialog.open();
        },

        onSaveEditDialog: function () {
            this._oODataModel.submitBatch("productsGroup").then(() => {
                MessageToast.show(this._i18n("saveSuccess"));
                if (this._oEditDialog) {
                    this._oEditDialog.close();
                }
            }).catch((oErr) => {
                MessageBox.error(this._i18n("saveError") + "\n" + (oErr.message || oErr));
            });
        },

        onCancelEditDialog: function () {
            if (this._oODataModel.hasPendingChanges("productsGroup")) {
                MessageBox.confirm(this._i18n("cancelConfirm"), {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._oODataModel.resetChanges("productsGroup");
                            if (this._oEditDialog) {
                                this._oEditDialog.close();
                            }
                        }
                    }
                });
            } else {
                if (this._oEditDialog) {
                    this._oEditDialog.close();
                }
            }
        },

        onCloseDetail: function () {
            console.log("[Products] onCloseDetail triggered!");
            const oFCL = this._getFCL();
            const oDetailView = this._getDetailView();

            if (oFCL) {
                oFCL.setLayout("OneColumn");
            }
            if (oDetailView) {
                oDetailView.unbindElement();
                oDetailView.setBindingContext(null);
            }
        },

        _getFCL: function () {
            // Master view is inside FCL's beginColumnPages, but UI5 might wrap it. Traverse upwards!
            let oControl = this.getView();
            while (oControl && oControl.getParent) {
                oControl = oControl.getParent();
                if (oControl && oControl.isA("sap.f.FlexibleColumnLayout")) {
                    return oControl;
                }
            }
            return null;
        },

        _getDetailView: function () {
            var oFCL = this._getFCL();
            if (oFCL) {
                var aMidPages = oFCL.getMidColumnPages();
                return aMidPages && aMidPages.length > 0 ? aMidPages[0] : null;
            }
            return null;
        },

        formatSupplierName: function (sID, aSuppliers, sOriginalName) {
            if (!sID) {
                return sOriginalName || "";
            }
            if (aSuppliers && aSuppliers.length > 0) {
                const oSupplier = aSuppliers.find(s => s.ID === sID);
                if (oSupplier) {
                    return oSupplier.name;
                }
            }
            return sOriginalName || "";
        },

        isRowReadonly: function (sID, aEditingRows) {
            try {
                if (!sID || !aEditingRows) return true;
                return aEditingRows.indexOf(sID) === -1;
            } catch (e) {
                return true;
            }
        },

        isRowEditable: function (sID, aEditingRows) {
            try {
                if (!sID || !aEditingRows) return false;
                return aEditingRows.indexOf(sID) !== -1;
            } catch (e) {
                return false;
            }
        },

        onFieldChange: function (oEvent) {
            const oInput = oEvent.getSource();
            if (oInput.getValue() === "") {
                oInput.setValueState("Error");
                oInput.setValueStateText(this._i18n("fieldRequired"));
            } else {
                oInput.setValueState("None");
            }
        },

        onSave: function () {
            if (!this._validateAll()) {
                MessageBox.error(this._i18n("validationError"));
                return;
            }

            this._oODataModel.submitBatch("productsGroup").then(() => {
                MessageToast.show(this._i18n("saveSuccess"));
                this._oUIModel.setProperty("/editingRows", []);
                this._onModelChange();
                this._oUIModel.refresh(true);
                this._getBinding().refresh();
            }).catch((oErr) => {
                MessageBox.error(this._i18n("saveError") + "\n" + (oErr.message || oErr));
            });
        },

        _validateAll: function () {
            let bValid = true;
            const oTable = this._getTable();
            oTable.getItems().forEach(oItem => {
                const oNameInput = oItem.getCells()[0];
                if (oNameInput && oNameInput.isA("sap.m.Input") && oNameInput.getValue() === "") {
                    oNameInput.setValueState("Error");
                    bValid = false;
                }
            });
            return bValid;
        },

        onCancel: function () {
            const bHasChanges = this._oODataModel.hasPendingChanges("productsGroup");
            if (!bHasChanges) {
                this._oUIModel.setProperty("/editingRows", []);
                this._onModelChange();
                this._oUIModel.refresh(true);
                this._getBinding().refresh();
                return;
            }

            MessageBox.confirm(this._i18n("cancelConfirm"), {
                onClose: (sAction) => {
                    if (sAction === MessageBox.Action.OK) {
                        this._oODataModel.resetChanges("productsGroup");
                        this._oUIModel.setProperty("/editingRows", []);
                        this._onModelChange();
                        this._oUIModel.refresh(true);
                        this._getBinding().refresh();
                    }
                }
            });
        },

        onDeleteSelected: function () {
            const oTable = this._getTable();
            const aSelected = oTable.getSelectedItems();
            if (!aSelected.length) return;

            MessageBox.confirm(
                this._i18n("deleteConfirm").replace("{0}", aSelected.length), {
                onClose: (sAction) => {
                    if (sAction === MessageBox.Action.OK) {
                        aSelected.forEach(oItem => {
                            oItem.getBindingContext().delete("productsGroup");
                        });
                        this._oODataModel.submitBatch("productsGroup").then(() => {
                            MessageToast.show(this._i18n("deleteSuccess"));
                            this._oUIModel.setProperty("/hasSelection", false);
                            this._oUIModel.setProperty("/hasPendingChanges", false);
                        }).catch((oErr) => {
                            MessageBox.error(this._i18n("deleteError") + "\n" + (oErr.message || oErr));
                        });
                    }
                }
            }
            );
        },


        onOpenCsvDialog: function () {
            if (!this._oCsvDialog) {
                this._oCsvDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "com.abics.casestudy.view.fragment.CsvUploadDialog",
                    this
                );
                this.getView().addDependent(this._oCsvDialog);
            }
            this._oCsvDialog.open();
        },

        onCsvFileChange: function (oEvent) {
            const oFile = oEvent.getParameter("files")[0];
            if (!oFile) return;

            const oReader = new FileReader();
            oReader.onload = (e) => {
                this._sCsvContent = e.target.result;

                const oValidateBtn = sap.ui.getCore().byId(this.getView().getId() + "--validateCsvBtn");
                if (oValidateBtn) oValidateBtn.setEnabled(true);
            };
            oReader.readAsText(oFile);
        },

        onValidateCsv: function () {
            if (!this._sCsvContent) return;

            const oAction = this._oODataModel.bindContext("/validateProductsCsv(...)");
            oAction.setParameter("csvContent", this._sCsvContent);

            oAction.execute().then(() => {
                const oResult = oAction.getBoundContext().getObject();
                this._showCsvValidationResult(oResult);
            }).catch((oErr) => {
                MessageBox.error(this._i18n("csvValidationFailed", [oErr.message || oErr]));
            });
        },

        _showCsvValidationResult: function (oResult) {
            const oResultModel = new JSONModel(oResult);
            const oResultsBox = sap.ui.getCore().byId(this.getView().getId() + "--csvValidationResults");
            if (oResultsBox) {
                oResultsBox.setModel(oResultModel, "csvResult");
                oResultsBox.setVisible(true);
            }

            const oUploadBtn = sap.ui.getCore().byId(this.getView().getId() + "--uploadCsvBtn");
            if (oUploadBtn) {
                oUploadBtn.setEnabled(oResult.valid === true);
            }
        },

        onUploadCsv: function () {
            if (!this._sCsvContent) return;

            const oAction = this._oODataModel.bindContext("/uploadProductsCsv(...)");
            oAction.setParameter("csvContent", this._sCsvContent);

            oAction.execute().then(() => {
                MessageToast.show(this._i18n("csvUploadSuccess"));
                this._oCsvDialog.close();
                this._getBinding().refresh();
                this._sCsvContent = null;
            }).catch((oErr) => {
                MessageBox.error(this._i18n("csvUploadFailed", [oErr.message || oErr]));
            });
        },

        onCsvDialogClose: function () {
            this._oCsvDialog.close();
            this._sCsvContent = null;
        },

        checkPendingChanges: function () {
            return new Promise((resolve, reject) => {
                if (!this._oODataModel.hasPendingChanges("productsGroup")) {
                    resolve();
                    return;
                }
                MessageBox.confirm(this._i18n("unsavedChanges"), {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._oODataModel.resetChanges("productsGroup");
                            resolve();
                        } else {
                            reject();
                        }
                    }
                });
            });
        },

        _i18n: function (sKey, aArgs) {
            const sText = this.getOwnerComponent().getModel("i18n").getProperty(sKey);
            return aArgs ? formatMessage(sText, aArgs) : sText;
        }

    });
});