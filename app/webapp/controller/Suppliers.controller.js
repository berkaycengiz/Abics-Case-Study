sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/base/strings/formatMessage"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, formatMessage) {
    "use strict";

    return Controller.extend("com.abics.casestudy.controller.Suppliers", {

        onInit: function () {
            this._oUIModel = new JSONModel({
                count: 0,
                hasSelection: false,
                editingRows: [],
                sortColumn: "createdAt",
                sortDescending: true,
                isInlineEditing: false,
                countries: []
            });
            this.getView().setModel(this._oUIModel, "suppliers");

            this._oODataModel = this.getOwnerComponent().getModel();

            this._aSorters = [];
            this._aSearchFilters = [];

            this._loadCountries();

            this._oODataModel.attachPropertyChange(this._onModelChange, this);

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.attachRouteMatched(this._onRouteChanged, this);
        },

        onExit: function () {
            this._oODataModel.detachPropertyChange(this._onModelChange, this);
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.detachRouteMatched(this._onRouteChanged, this);
        },

        _onRouteChanged: function (oEvent) {
            var sRouteName = oEvent.getParameter("name");
            if (sRouteName !== "suppliers") {
                if (this._oODataModel.hasPendingChanges("suppliersGroup")) {
                    this._oODataModel.resetChanges("suppliersGroup");
                }
                this._oUIModel.setProperty("/editingRows", []);
                this._onModelChange();
                this._oUIModel.refresh(true);
            }
        },

        _onModelChange: function () {
            var aEditingRows = this._oUIModel.getProperty("/editingRows") || [];
            var bHas = this._oODataModel.hasPendingChanges("suppliersGroup");
            this._oUIModel.setProperty("/isInlineEditing", aEditingRows.length > 0);
            this._oUIModel.setProperty("/hasPendingChanges", bHas || aEditingRows.length > 0);
        },

        _getTable: function () {
            var oTable = this.byId("supplierTable");
            if (!oTable) {
                // If not found in current view (e.g. called from Detail), search in Master view
                var oFCL = this._getFCL();
                if (oFCL) {
                    var aBeginPages = oFCL.getBeginColumnPages();
                    var oMasterView = aBeginPages && aBeginPages.length > 0 ? aBeginPages[0] : null;
                    if (oMasterView) {
                        oTable = oMasterView.byId("supplierTable");
                    }
                }
            }
            return oTable;
        },

        _getBinding: function () {
            return this._getTable().getBinding("items");
        },

        _loadCountries: function () {
            var oBinding = this._oODataModel.bindList("/Countries", null, null, null, {
                $select: "code,name"
            });

            oBinding.requestContexts(0, 300).then((aContexts) => {
                var aCountries = aContexts.map(oC => {
                    var oData = oC.getObject();
                    return {
                        code: oData.code || oData.CODE || "",
                        name: oData.name || oData.NAME || ""
                    };
                });
                this._oUIModel.setProperty("/countries", aCountries);
            }).catch((oErr) => {
                console.error("Failed to load countries:", oErr);
            });
        },

        onSelectionChange: function () {
            var aSelected = this._getTable().getSelectedItems();
            this._oUIModel.setProperty("/hasSelection", aSelected.length > 0);
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue").trim();
            if (sQuery) {
                this._aSearchFilters = [new Filter({
                    filters: [
                        new Filter({ path: "name",    operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false }),
                        new Filter({ path: "city",    operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false }),
                        new Filter({ path: "email",   operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false }),
                        new Filter({ path: "address", operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false })
                    ],
                    and: false
                })];
            } else {
                this._aSearchFilters = [];
            }
            this._applyFilters();
        },

        _applyFilters: function () {
            if (this._aSearchFilters.length > 0) {
                this._getBinding().filter(new Filter({ filters: this._aSearchFilters, and: false }));
            } else {
                this._getBinding().filter([]);
            }
        },

        onSort: function (oEvent) {
            var oBtn = oEvent.getSource();
            var sColumn = oBtn.data("column");
            var sCurrentSort = this._oUIModel.getProperty("/sortColumn");
            var bCurrentDesc = this._oUIModel.getProperty("/sortDescending");

            var sNewColumn = sColumn;
            var bNewDescending = false;
            var aSorters = [];

            if (sCurrentSort === sColumn) {
                if (!bCurrentDesc) {
                    bNewDescending = true;
                    aSorters = [new Sorter(sColumn, true)];
                } else {
                    sNewColumn = "";
                    bNewDescending = false;
                    aSorters = [];
                }
            } else {
                bNewDescending = false;
                aSorters = [new Sorter(sColumn, false)];
            }

            this._oUIModel.setProperty("/sortColumn", sNewColumn);
            this._oUIModel.setProperty("/sortDescending", bNewDescending);
            this._aSorters = aSorters;
            this._getBinding().sort(this._aSorters);
        },

        onDataReceived: function () {
            var oTable = this._getTable();
            if (oTable) {
                this._oUIModel.setProperty("/count", oTable.getItems().length);
            }
        },

        onAddRow: function () {
            var oBinding = this._getBinding();
            var sID = globalThis.crypto ? crypto.randomUUID() : Math.random().toString();
            var aCountries = this._oUIModel.getProperty("/countries") || [];
            var sDefaultCountry = aCountries.length > 0 ? aCountries[0].code : "";

            oBinding.create({
                ID: sID,
                name: "",
                email: "",
                phone: "",
                country_code: sDefaultCountry, // Set default country
                city: "",
                address: ""
            }, false, false);

            var aEditingRows = this._oUIModel.getProperty("/editingRows") || [];
            this._oUIModel.setProperty("/editingRows", [...aEditingRows, sID]);
            this._onModelChange();
            this._oUIModel.refresh(true);
            this._getTable().scrollToIndex(0);
        },

        onEditRow: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            if (!oContext) return;
            var sID = oContext.getProperty("ID");
            var aEditingRows = this._oUIModel.getProperty("/editingRows") || [];
            if (sID && !aEditingRows.includes(sID)) {
                this._oUIModel.setProperty("/editingRows", [...aEditingRows, sID]);
                this._onModelChange();
                this._oUIModel.refresh(true);
            }
        },

        onRowPress: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext();
            if (!oContext && oSource.getParent) {
                var oParent = oSource.getParent();
                if (oParent && oParent.getBindingContext) {
                    oContext = oParent.getBindingContext();
                }
            }
            if (!oContext) return;

            var oFCL = this._getFCL();
            var oDetailView = this._getDetailView();

            if (oDetailView) {
                // Use bindElement to fetch products explicitly for this supplier
                oDetailView.bindElement({
                    path: oContext.getPath(),
                    parameters: {
                        $expand: 'products,country',
                        $$updateGroupId: 'suppliersGroup'
                    }
                });
            }
            if (oFCL) {
                oFCL.setLayout("TwoColumnsBeginExpanded");
            }
        },

        onSupplierProductsUpdateFinished: function (oEvent) {
            var oList = oEvent.getSource();
            var iCount = oEvent.getParameter("total") || 0;
            var sViewId = this.getView().getId();
            var oText = sap.ui.getCore().byId(sViewId + "--supplierProductsCountText");
            if (oText) {
                oText.setText(iCount + " product(s)");
            }
        },

        onCloseDetail: function () {
            var oFCL = this._getFCL();
            var oDetailView = this._getDetailView();
            if (oFCL) {
                oFCL.setLayout("OneColumn");
            }
            if (oDetailView) {
                oDetailView.unbindElement();
                oDetailView.setBindingContext(null);
            }
        },

        _getFCL: function () {
            var oControl = this.getView();
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

        onOpenEditDialog: function () {
            var oDetailView = this._getDetailView();
            var oContext = oDetailView ? oDetailView.getBindingContext() : null;

            if (!oContext) {
                MessageToast.show(this._i18n("noSupplierSelected"));
                return;
            }

            if (!this._oEditDialog) {
                this._oEditDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "com.abics.casestudy.view.fragment.SupplierEditDialog",
                    this
                );
                this.getView().addDependent(this._oEditDialog);
            }

            // Create buffer model for isolated editing
            var oData = oContext.getObject();
            var oEditModel = new JSONModel({
                name: oData.name || "",
                email: oData.email || "",
                phone: oData.phone || "",
                country_code: oData.country_code || "",
                city: oData.city || "",
                address: oData.address || ""
            });
            this._oEditDialog.setModel(oEditModel, "editModel");
            
            // Still set context so fragment can use it for labels or other read-only info if needed
            this._oEditDialog.setBindingContext(oContext);
            this._oEditDialog.open();
        },

        onSaveEditDialog: function () {
            if (!this._validateEditDialog()) {
                MessageBox.error(this._i18n("validationError"));
                return;
            }

            var oDetailView = this._getDetailView();
            var oContext = oDetailView ? oDetailView.getBindingContext() : null;
            var oEditData = this._oEditDialog.getModel("editModel").getData();

            if (oContext) {
                // Sync changes back to OData context
                Object.keys(oEditData).forEach(function (sProp) {
                    if (oContext.getProperty(sProp) !== oEditData[sProp]) {
                        oContext.setProperty(sProp, oEditData[sProp]);
                    }
                });
            }

            this._oODataModel.submitBatch("suppliersGroup").then(() => {
                MessageToast.show(this._i18n("saveSuccess"));
                this._getBinding().refresh(); // Refresh master table
                if (this._oEditDialog) {
                    this._oEditDialog.close();
                }
            }).catch((oErr) => {
                MessageBox.error(this._i18n("saveError") + "\n" + (oErr.message || oErr));
            });
        },

        _validateEditDialog: function () {
            var bValid = true;
            var sViewId = this.getView().getId();

            // Name Validation
            var oNameInput = sap.ui.getCore().byId(sViewId + "--supplierEditName");
            if (oNameInput) {
                if (!oNameInput.getValue() || oNameInput.getValue().trim() === "") {
                    oNameInput.setValueState("Error");
                    oNameInput.setValueStateText(this._i18n("fieldRequired"));
                    bValid = false;
                } else {
                    oNameInput.setValueState("None");
                }
            }

            // Email Validation (Regex from CDS)
            var oEmailInput = sap.ui.getCore().byId(sViewId + "--supplierEditEmail");
            if (oEmailInput) {
                var sEmail = oEmailInput.getValue();
                var oEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                if (sEmail && !oEmailRegex.test(sEmail)) {
                    oEmailInput.setValueState("Error");
                    oEmailInput.setValueStateText(this._i18n("invalidEmailFormat"));
                    bValid = false;
                } else {
                    oEmailInput.setValueState("None");
                }
            }

            // Country Validation
            var oCountrySelect = sap.ui.getCore().byId(sViewId + "--supplierEditCountry");
            if (oCountrySelect) {
                if (!oCountrySelect.getSelectedKey()) {
                    oCountrySelect.setValueState("Error");
                    oCountrySelect.setValueStateText(this._i18n("fieldRequired"));
                    bValid = false;
                } else {
                    oCountrySelect.setValueState("None");
                }
            }

            return bValid;
        },

        onCancelEditDialog: function () {
            var oDetailView = this._getDetailView();
            var oContext = oDetailView ? oDetailView.getBindingContext() : null;
            var oEditData = this._oEditDialog.getModel("editModel").getData();
            var bChanged = false;

            if (oContext) {
                var oOriginalData = oContext.getObject();
                bChanged = Object.keys(oEditData).some(function (sProp) {
                    return oOriginalData[sProp] !== oEditData[sProp];
                });
            }

            if (bChanged) {
                MessageBox.confirm(this._i18n("cancelConfirm"), {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
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

        onSave: function () {
            if (!this._validateAll()) {
                MessageBox.error(this._i18n("validationError"));
                return;
            }
            this._oODataModel.submitBatch("suppliersGroup").then(() => {
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
            var bValid = true;
            var oTable = this._getTable();
            var aEditingRows = this._oUIModel.getProperty("/editingRows") || [];

            oTable.getItems().forEach((oItem) => {
                var oCtx = oItem.getBindingContext();
                if (!oCtx) return;
                var sID = oCtx.getProperty("ID");
                if (!aEditingRows.includes(sID)) return;

                var aCells = oItem.getCells();
                var oNameVBox = aCells[0];
                var oNameInput = oNameVBox && oNameVBox.getItems ? oNameVBox.getItems().find(c => c.isA("sap.m.Input")) : null;
                if (oNameInput) {
                    if (!oNameInput.getValue() || oNameInput.getValue().trim() === "") {
                        oNameInput.setValueState("Error");
                        oNameInput.setValueStateText(this._i18n("fieldRequired"));
                        bValid = false;
                    } else {
                        oNameInput.setValueState("None");
                    }
                }

                // Inline editing Country Validation
                var oCountryVBox = aCells[5]; // Correct index for Country Column
                var oCountrySelect = oCountryVBox && oCountryVBox.getItems ? oCountryVBox.getItems().find(c => c.isA("sap.m.ComboBox")) : null;
                if (oCountrySelect) {
                    if (!oCountrySelect.getSelectedKey()) {
                        oCountrySelect.setValueState("Error");
                        oCountrySelect.setValueStateText(this._i18n("fieldRequired"));
                        bValid = false;
                    } else {
                        oCountrySelect.setValueState("None");
                    }
                }

                // Inline editing Email validation
                var oEmailVBox = aCells[1]; // Correct index for Email Column
                var oEmailInput = oEmailVBox && oEmailVBox.getItems ? oEmailVBox.getItems().find(c => c.isA("sap.m.Input")) : null;
                if (oEmailInput) {
                    var sEmail = oEmailInput.getValue();
                    var oEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                    if (sEmail && !oEmailRegex.test(sEmail)) {
                        oEmailInput.setValueState("Error");
                        oEmailInput.setValueStateText(this._i18n("invalidEmailFormat"));
                        bValid = false;
                    } else {
                        oEmailInput.setValueState("None");
                    }
                }
            });

            return bValid;
        },

        onCancel: function () {
            var bHasChanges = this._oODataModel.hasPendingChanges("suppliersGroup");
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
                        this._oODataModel.resetChanges("suppliersGroup");
                        this._oUIModel.setProperty("/editingRows", []);
                        this._onModelChange();
                        // Redundant refresh removed to let OData V4 handle the removal smoothly
                        this._oUIModel.refresh(true);
                    }
                }
            });
        },

        onDeleteSelected: function () {
            var oTable = this._getTable();
            var aSelected = oTable.getSelectedItems();
            if (!aSelected.length) return;

            MessageBox.confirm(
                this._i18n("deleteConfirm").replace("{0}", aSelected.length), {
                onClose: (sAction) => {
                    if (sAction === MessageBox.Action.OK) {
                        aSelected.forEach((oItem) => {
                            oItem.getBindingContext().delete("suppliersGroup");
                        });
                        this._oODataModel.submitBatch("suppliersGroup").then(() => {
                            MessageToast.show(this._i18n("deleteSuccess"));
                            this._oUIModel.setProperty("/hasSelection", false);
                            this._oUIModel.setProperty("/count", this._getTable().getItems().length);
                        }).catch((oErr) => {
                            MessageBox.error(this._i18n("deleteError") + "\n" + (oErr.message || oErr));
                        });
                    }
                }
            });
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
            var oControl = oEvent.getSource();
            var sVal = "";
            
            if (oControl.isA("sap.m.ComboBox")) {
                sVal = oControl.getSelectedKey();
            } else {
                sVal = oControl.getValue();
            }

            if (!sVal || sVal.trim() === "") {
                oControl.setValueState("Error");
                oControl.setValueStateText(this._i18n("fieldRequired"));
            } else {
                oControl.setValueState("None");
            }
        },

        onOpenCsvDialog: function () {
            if (!this._oCsvDialog) {
                this._oCsvDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "com.abics.casestudy.view.fragment.SuppliersCsvUploadDialog",
                    this
                );
                this.getView().addDependent(this._oCsvDialog);
            }
            this._oCsvDialog.open();
        },

        onCsvFileChange: function (oEvent) {
            var oFile = oEvent.getParameter("files")[0];
            if (!oFile) return;

            this._sCsvFileName = oFile.name;

            var oReader = new FileReader();
            oReader.onload = (e) => {
                this._sCsvContent = e.target.result;
                this._onValidateCsv();
            };
            oReader.readAsText(oFile);
        },

        _onValidateCsv: function () {
            if (!this._sCsvContent) return;

            var oAction = this._oODataModel.bindContext("/validateSuppliersCsv(...)");
            oAction.setParameter("csvContent", this._sCsvContent);

            oAction.execute().then(() => {
                var oResult = oAction.getBoundContext().getObject();
                this._showCsvValidationResult(oResult, this._sCsvFileName);
            }).catch((oErr) => {
                sap.m.MessageBox.error(this._i18n("csvValidationFailed", [oErr.message || oErr]));
            });
        },

        _showCsvValidationResult: function (oResult, sFileName) {
            var aErrors = oResult.errors || [];
            var bValid  = oResult.valid === true;

            var lines = (this._sCsvContent || "").split(/\r?\n/).filter(l => l.trim() !== "");
            var iTotalRows = Math.max(0, lines.length - 1);
            var header = lines.length > 0 ? lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, "")) : [];
            var requiredCols = ["name"];
            var bHasRequiredCols = requiredCols.every(c => header.includes(c));
            var bHasRows  = iTotalRows > 0;
            var bDataValid = bHasRequiredCols && bHasRows && aErrors.length === 0;

            var aChecks = [
                { label: this._i18n("csvCheckFormat"),  passed: true,            detail: "" },
                { label: this._i18n("csvCheckColumns"), passed: bHasRequiredCols, detail: bHasRequiredCols ? "" : requiredCols.filter(c => !header.includes(c)).join(", ") },
                { label: this._i18n("csvCheckRows"),    passed: bHasRows,         detail: "" },
                { label: this._i18n("csvCheckData"),    passed: bDataValid,       detail: bDataValid ? "" : aErrors.slice(0, 3).map(e => e.message).join("; ") }
            ];

            var oResultModel = new JSONModel({
                fileName:  sFileName || "",
                totalRows: iTotalRows,
                valid:     bValid,
                checks:    aChecks,
                errors:    aErrors
            });

            var sViewId = this.getView().getId();

            var oResultsBox = sap.ui.getCore().byId(sViewId + "--supplierCsvValidationResults");
            if (oResultsBox) {
                oResultsBox.setModel(oResultModel, "csvResult");
                oResultsBox.setVisible(true);
            }

            var oErrorPanel = sap.ui.getCore().byId(sViewId + "--supplierCsvErrorPanel");
            if (oErrorPanel) {
                oErrorPanel.setVisible(aErrors.length > 0);
            }

            var oUploadBtn = sap.ui.getCore().byId(sViewId + "--uploadSupplierCsvBtn");
            if (oUploadBtn) {
                oUploadBtn.setEnabled(bValid);
            }
        },

        onUploadCsv: function () {
            if (!this._sCsvContent) return;

            var oAction = this._oODataModel.bindContext("/uploadSuppliersCsv(...)");
            oAction.setParameter("csvContent", this._sCsvContent);

            oAction.execute().then(() => {
                sap.m.MessageToast.show(this._i18n("csvUploadSuccess"));
                this._oCsvDialog.close();
                this._getBinding().refresh();
                this._sCsvContent = null;
            }).catch((oErr) => {
                sap.m.MessageBox.error(this._i18n("csvUploadFailed", [oErr.message || oErr]));
            });
        },

        onCsvDialogClose: function () {
            this._oCsvDialog.close();
            this._sCsvContent = null;
        },

        _i18n: function (sKey, aArgs) {
            var sText = this.getOwnerComponent().getModel("i18n").getProperty(sKey);
            return aArgs ? formatMessage(sText, aArgs) : sText;
        }

    });
});
