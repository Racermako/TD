/* Simple JavaScript Inheritance
 * By John Resig http://ejohn.org/
 * MIT Licensed.
 */
// Inspired by base2 and Prototype
(function () {
    var initializing = false, fnTest = /xyz/.test(function () { xyz; }) ? /\b_super\b/ : /.*/;
    // The base Class implementation (does nothing)
    this.Class = function () { };

    // Create a new Class that inherits from this class
    Class.extend = function (prop) {
        var _super = this.prototype;

        // Instantiate a base class (but only create the instance,
        // don't run the init constructor)
        initializing = true;
        var prototype = new this();
        initializing = false;

        // Copy the properties over onto the new prototype
        for (var name in prop) {
            // Check if we're overwriting an existing function
            prototype[name] = typeof prop[name] == "function" &&
              typeof _super[name] == "function" && fnTest.test(prop[name]) ?
              (function (name, fn) {
                  return function () {
                      var tmp = this._super;

                      // Add a new ._super() method that is the same method
                      // but on the super-class
                      this._super = _super[name];

                      // The method only need to be bound temporarily, so we
                      // remove it when we're done executing
                      var ret = fn.apply(this, arguments);
                      this._super = tmp;

                      return ret;
                  };
              })(name, prop[name]) :
              prop[name];
        }

        // The dummy class constructor
        function Class() {
            // All construction is actually done in the init method
            if (!initializing && this.init)
                this.init.apply(this, arguments);
        }

        // Populate our constructed prototype object
        Class.prototype = prototype;

        // Enforce the constructor to be what we expect
        Class.constructor = Class;

        // And make this class extendable
        Class.extend = arguments.callee;

        return Class;
    };
})();

/**
 * Root TD namespace.
 * @namespace Td
 */
var Td = {};

/**
 * Data classes.
 * @namespace Td.Data
 */
Td.Data = {

    Operation: Class.extend({

        endpoint: "",
        returnBind: "",
        paramBinds: {},

        /**
         * Create new operation instance
         * @constructs Td.Data.Operation
         * @classdesc Client side handling of invoking server operations.
         * @param {string} name - use to lookup operation later
         * @param {string} endpoint - address to webservice endpoint
         * @param {string} returnBind - optional bind for any return value
         * @param {array} paramBinds - optional binds to pull data from when invoking this operation
         */
        init: function (name, endpoint, returnBind, paramBinds) {
            this.name = name;
            this.endpoint = endpoint;
            this.returnBind = returnBind;
            this.paramBinds = paramBinds;
            Td.Data.Operation.opMap[name] = this;
        },

        /**
         * Invokes an operation via AJAX
         * @param {object} opts - Options, i.e. complete callback
         * @function
         * @instance
         * @memberof Td.Data.Operation
         */
        invoke: function (opts) {

            Td.Util.log("invoke called on " + this.name);

            var _this = this;
            var invokeArgs = {};

            var paramsValid = true;
            var asyncBinds = [];
            var validateParams = !opts || !opts.noValidate;

            for (paramName in this.paramBinds) {
                var bindName = this.paramBinds[paramName];
                var bindElems = bindName.split('.');
                var bindSource = bindElems[0];
                var path = null;
                if (bindElems.length > 1) {
                    bindElems.shift();
                    path = bindElems.join('.');
                }

                var bind = Td.Data.Binding.get(bindSource);
                if (validateParams && !bind.isValid()) {
                    paramsValid = false;
                }
                else {
                    if (bind.requiresAsync) {
                        asyncBinds.push(bind.getDeferredValue([paramName]));
                    }
                    else {
                        invokeArgs[paramName] = bind.getValue(path);
                    }

                    if (!path) {
                        //see if we have a udv bind, and if any of it's members are binary binds that require async upload
                        var binaryMemoInfo = bind._getBinaryDeferred();
                        if (binaryMemoInfo.hasAsyncVals) {
                            //replace invoke arg with clone that has async values nulled out
                            invokeArgs[paramName] = binaryMemoInfo.bindVal;
                            for (var idx = 0; idx < binaryMemoInfo.deferredMems.length; idx++) {
                                asyncBinds.push(binaryMemoInfo.deferredMems[idx]);
                            }
                        }
                    }
                }
            }

            if (!paramsValid) {
                Td.Util.log("Parameter binds failed validation");
                if (opts && opts.error) {
                    opts.error();
                }
                return;
            }

            if (asyncBinds.length == 0) {
                var placeholder = $.Deferred();
                placeholder.resolve();
                asyncBinds.push(placeholder);
            }
            else {
                Td.Util.log("operation contains async binds, fetching");
            }

            $.when.apply($, asyncBinds).done(function () {

                Td.Util.log("resolved all parameters - " + _this.name);

                //if any async binds resolved, their info is passed in as arguments
                //each arg is an array of [bindval, params]

                if (asyncBinds.length == 1
                        && arguments.length == 2) {
                    invokeArgs[arguments[1][0]] = arguments[0];
                }
                else {
                    for (var idx = 0; idx < arguments.length; idx++) {
                        var arg = arguments[idx];
                        var bindVal = arg[0];
                        var params = arg[1];
                        invokeArgs[params[0]] = bindVal;
                    }
                }

                _this._invokeAjax(invokeArgs, opts);

            }).fail(function () {
				Td.Util.hideWaitIcon();
                Td.Util.log("unable to resolve bind parameters - " + _this.name);
                var msg = "An error occurred while resolving bind parameter: " + arguments[0][0];
                if (opts && opts.error) {
                    opts.error(msg);
                }
                else {
                    Td.Util.showMessage(msg);
                }
            });
        },

        _invokeAjax: function (invokeArgs, opts) {
            var _this = this;
            Td.Util.log("executing ajax post - " + _this.name);

            if (!(opts && opts.noloader)) {
                Td.Util.showWaitIcon();
            }

            var endpointURL = this.endpoint;
            if (Td.Util.isCordovaApp()) {
                endpointURL = Td.Config.getAppURL() + "/" + endpointURL;
            }

            $.ajax({
                type: "POST",
                data: JSON.stringify(invokeArgs),
                url: endpointURL,
                contentType: "application/json",
                dataType: "json"
            })
            .done(function (data, textStatus, jqXHR) {
                Td.Util.hideWaitIcon();
                _this._updateTargetBind(data);
                if (opts && opts.complete) {
                    opts.complete();
                }
            })
            .fail(function (e, textStatus) {
                Td.Util.hideWaitIcon();

                if (textStatus == "abort") {
                    //don't show error for aborted requests
                    return;
                }

                var jsonMsg;
                var jsonExcType;

                if (e.status == 500) {
                    try {
                        var rspObj = $.parseJSON(e.responseText);
                        jsonMsg = rspObj.Message;
                        jsonExcType = rspObj.ExceptionType;

                        if (jsonMsg == "Not Authorized") {
                            window.location = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
                            return;
                        }
                    } catch (err) { }
                }

                var serverTxt = e.statusText;
                if (jsonMsg) {
                    serverTxt = serverTxt + " " + jsonMsg;
                }

                var hasErrHandler = false;
                if (Td.Controls._currPage) {
                    var errMsg = jsonMsg ? jsonMsg : serverTxt;
                    hasErrHandler = Td.Controls._currPage.raiseError(errMsg, e.status, _this.name, jsonExcType);
                }

                var msg = Td.Util._formatString(Td.Localization.resolveByKey("ComErr"), [serverTxt]);

                if (opts && opts.error) {
                    opts.error(msg);
                }
                else if (!hasErrHandler) {
                    Td.Util.showMessage(msg);
                }
            });
        },

        _updateTargetBind: function (data) {
            if (this.returnBind != "") {
                var bindSource = this.returnBind;
                var path;
                var dIdx = bindSource.indexOf('.');
                if (dIdx != -1) {
                    path = bindSource.substring(dIdx + 1, bindSource.length);
                    bindSource = bindSource.substring(0, dIdx);
                }
                Td.Util._fixDates(data.d);
                Td.Data.Binding.get(bindSource).setValue(data.d, path);
            }
        }
    }),


    Binding: Class.extend({

        name: "",
        type: "",
        value: {},

        /**
         * Create new bind instance
         * @constructs Td.Data.Binding
         * @classdesc Handles updating/getting binding values.
         * @param {string} name - Use to lookup binding later
         * @param {string} datatype - The underlying TD type of this bind (Number, String, Functional Class)
         * @param {object} opts - Options for this bind (initial value etc.)
         */
        init: function (name, datatype, opts) {
            this.name = name;
            this.type = datatype;
            this.boolOpts = opts.boolstate;
            this.opts = opts;
            this.value = {};
            this._isInit = true;
            Td.Data.Binding.bindMap[name] = this;

            var qParams = Td.Util.getQueryParams();
            var bindQueryVal = qParams[name];
            var hasQueryVal = typeof (bindQueryVal) != "undefined";

            if (this.type == "Functional Class") {
                this.memberMap = {};
                this._buildMemberMap(opts.members, "");
            }

            if (hasQueryVal) {
                if (this.type == "Date/Time") {
                    bindQueryVal = new Date(bindQueryVal);
                }
                this.setValue(bindQueryVal);
            }
            else if (typeof (opts.initval) != "undefined") {
                this.setValue(opts.initval);
            }
            else {
                //set default value
                if (this.type == "String") {
                    this.value = "";
                }
                else if (this.type == "Number") {
                    this.value = { Value: 0, IsNull: false };
                }
                else if (this.type == "Date/Time") {
                    this.value = { Value: new Date(), IsNull: true };
                }
                else if (this.type == "Boolean") {
                    this.value = false;
                }
                else if (this.type == "Binary") {
                    this.value = null;
                }
            }
            this._isInit = false;
        },

        _buildMemberMap: function (members, parentPath) {
            for (var idx = 0; idx < members.length; idx++) {
                var member = members[idx];
                var memPath = parentPath + member.name;

                this.memberMap[memPath] = member;

                if (typeof (member.opts.initval) != "undefined") {
                    this.setValue(member.opts.initval, memPath);
                    this.hasNonDefaultInitValue = true;
                }
                else {
                    if (member.type == "String"
                        || member.type == "Number"
                        || member.type == "Date/Time") {
                        this.setValue("", memPath);
                    }
                    else if (member.type == "Boolean") {
                        this.setValue(false, memPath);
                    }
                }

                if (member.type == "Functional Class") {
                    this.setValue({}, memPath);
                    this._buildMemberMap(member.members, memPath + ".");
                }
            }
        },

        /**
         * Update the value of this bind
         * @param {object} value - The new value of the bind, should be underlying type (string, number)
         * @param {string} path - For a UDV bind, optional member name on that class to set.
         * @function
         * @instance
         * @memberof Td.Data.Binding
         */
        setValue: function (value, path) {
            if (Td.Util.debug) {
                var logVal = value;
                if (typeof (logVal) == "object") {
                    logVal = JSON.stringify(logVal);
                }
                var logMsg = 'Bind ' + this.name + ' value updated: ' + logVal;
                if (path) {
                    logMsg += " path: " + path;
                }
                Td.Util.log(logMsg);
            }

            var memInfo = this;
            if (path) {
                memInfo = this.memberMap[path];
            }
            else {
                this.hasNonDefaultInitValue = true;
            }

            if ((memInfo.type == "Date/Time"
                    || memInfo.type == "Number")
                    && (value == null || typeof (value.IsNull) == "undefined")) {
                var isNull = value == null || typeof (value) == "undefined" || value === "";
                if (memInfo.type == "Date/Time") {
                    if (typeof (value) == "string") {
                        if (value.indexOf('-') == -1
                                && value.indexOf(':') != -1) {
                            //just time
                            var timeElems = value.split(':');
                            value = new Date(0, 0, 0, parseInt(timeElems[0]), parseInt(timeElems[1]), 0, 0);
                        }
                        else {
                            //Dates with dash YYYY-mm-dd get parsed
                            //as UTC, which we don't want (causes day value to be incorrect)
                            value = value.replace(/-/g, "/");
                            
                            //Split the date into numeric parts, some browsers (iOS) date pickers
                            //pass values that don't work with the string ctor of Date.
                            var dt = value.split(/[^0-9]/);
							if (dt.length < 3){
								//empty date
								value = new Date(0);
							}
							else if (dt.length == 3){
								//just a date
								value = new Date(dt[0], dt[1] - 1, dt[2]);
							}
							else {
								value = new Date(dt[0], dt[1] - 1, dt[2], dt[3], dt[4]);
							}
                        }
                    }
                    else if (value == null || typeof (value) == "undefined") {
                        value = new Date(0);
                    }
                }
                else if (memInfo.type == "Number") {
                    if (typeof (value) == "string") {
                        if (value == "") {
                            value = 0;
                            isNull = true;
                        }
                        else {
                            value = Td.Localization.parseNumber(value);
                            isNull = isNaN(value);
                        }
                    }
                    else if (value == null || typeof (value) == "undefined") {
                        value = 0;
                    }
                }
                value = { Value: value, IsNull: isNull };

                //make sure our value object has this property defined, used elsewhere to detect
                //the object is a SAL date
                if (memInfo.type == "Date/Time") {
                    value.IsYearZero = false;
                }
            }
            else if (memInfo.type == "Functional Class") {
                //if we're a udv, and value is a string, assume it's JSON
                if (typeof (value) == "string") {
                    if (value == "") {
                        //if the string is empty, reset the value to default
                        this.value = {};
                        this._buildMemberMap(this.opts.members, "");
                        return;
                    }
                    value = JSON.parse(value);
                    Td.Util._fixDates(value);
                }
                else if (value == null || typeof (value) == "undefined") {
                    value = {};
                    this.value = value;
                    this._buildMemberMap(this.opts.members, "");
                }
            }
            else if (memInfo.type == "Boolean") {
                if (typeof (value) == "string") {
                    //convert to boolean
                    value = value == "true";
                }
            }

            var sameVal = false;

            if (path) {
                var bindElements = path.split('.');
                var parentObj = this.value;
                for (var idx = 0; idx < bindElements.length - 1; idx++) {
                    parentObj = parentObj[bindElements[idx]];
                }
                var prop = bindElements[bindElements.length - 1];

                sameVal = parentObj[prop] === value;
                parentObj[prop] = value;
            }
            else {
                sameVal = this.value === value;
                this.value = value;
            }

            if (!sameVal) {

                if (this.opts.changed && !this._isInit) {
                    this.opts.changed();
                }

                $(this).trigger('changed', [this.value, path]);
            }
            else {
                Td.Util.log("value not changed, not raising changed event");
            }
        },

        /**
         * Get the value of this bind
         * @param {string} path - For a UDV bind, optional member name on that class to get.
         * @function
         * @instance
         * @memberof Td.Data.Binding
         */
        getValue: function (path) {
            var value = this.value;
            if (path) {
                var pathElems = path.split(".");
                for (var idx = 0; idx < pathElems.length; idx++) {
                    value = value[pathElems[idx]];
                }
            }
            return value;
        },

        /**
         * Get the current boolean state of this bind
         * @param {string} path - For a UDV bind, optional member name on that class to get.
         * @return {bool} - The boolean state
         * @function
         * @instance
         * @memberof Td.Data.Binding
         */
        boolValue: function (path, itemVal) {
            var val;
            if (typeof (itemVal) != "undefined") {
                //lookup val relative to itemVal (used for array item lookup)
                val = itemVal;
                if (path) {
                    var pathElems = path.split(".");
                    for (var idx = 0; idx < pathElems.length; idx++) {
                        val = val[pathElems[idx]];
                    }
                }
            }
            else {
                val = this.getValue(path);
            }
            var memInfo = this;

            if (path) {
                memInfo = this.memberMap[path];
            }

            if (memInfo.opts.boolstate) {
                var isNull = false;
                if ((memInfo.type == "Number" || memInfo.type == "Date/Time")
                        && typeof (val) != "undefined" && val != null) {
                    isNull = val.IsNull;
                    val = val.Value;
                }
                else if (val == null || typeof (val) == "undefined") {
                    isNull = true;
                }

                var compareVal = memInfo.opts.boolstate.compareval;

                switch (memInfo.opts.boolstate.booltype) {
                    case "EqualsValue":
                        val = val == compareVal;
                        break;
                    case "DoesntEqualValue":
                        val = val != compareVal;
                        break;
                    case "EvaluateFunction":
                        val = window[compareVal](val);
                        break;
                    case "HasItems":
                        val = !isNull && val.length > 0;
                        break;
                    case "HasNoItems":
                        val = isNull || val.length == 0;
                        break;
                    case "IsNull":
                        val = isNull == true;
                        break;
                    case "NotNull":
                        val = isNull == false;
                        break;
                    case "GreaterThanValue":
                        val = !isNull && val > compareVal;
                        break;
                    case "LessThanValue":
                        val = !isNull && val < compareVal;
                        break;
                }
            }

            return val;
        },

        /**
         * Store this bind in the browsers local storage
         * @param {string} key - key to use to store this bind
         * @function
         * @instance
         * @memberof Td.Data.Binding
         */
        store: function (key) {
            if (typeof (localStorage) != "undefined") {
                var storeObj =
                {
                    value: this.value,
                    time: new Date()
                };
                localStorage.setItem(key, JSON.stringify(storeObj));
            }
        },

        /**
         * Load this bind from the browsers local storage
         * @param {string} key - key to use to lookup the bind
         * @return {bool} - False if the data is not in storage, or it's expired
         * @function
         * @instance
         * @memberof Td.Data.Binding
         */
        restore: function (key) {
            if (typeof (localStorage) != "undefined") {
                var itemStr = localStorage.getItem(key);
                if (itemStr) {
                    var storeObj = JSON.parse(itemStr);

                    if (typeof (storeObj.time) != "undefined") {
                        var hasExpired = false;
                        if (this.opts.expiretime > 0) {
                            var currTime = new Date();
                            var timeDiff = (currTime - new Date(storeObj.time));
                            var diffInMinutes = Math.round(((timeDiff % 86400000) % 3600000) / 60000);
                            hasExpired = diffInMinutes > this.opts.expiretime;
                        }
                        if (!hasExpired) {
                            Td.Util._fixDates(storeObj.value);
                            this.setValue(storeObj.value);
                            this.hasNonDefaultInitValue = true;
                            return true;
                        }
                        else {
                            localStorage.removeItem(key);
                        }
                    }
                }
            }
            return false;
        },

        /**
         * Get the TD type of a member
         * @param {string} path - For a UDV bind, member name
         * @return {string} - The TD type
         * @function
         * @instance
         * @memberof Td.Data.Binding
         */
        getType: function (path) {
            var memInfo = this;
            if (path) {
                memInfo = this.memberMap[path];
            }
            if (memInfo) {
                return memInfo.type;
            }
            return "";
        },

        /**
         * Checks if this binding, or just a member of this bind, is valid.
         * @param {String} path - For a UDV bind, optional field name
         * @return {bool} - True if the bind/member is valid.
         * @function
         * @instance
         * @memberof Td.Data.Binding
         */
        isValid: function (path) {

            if (this.opts.array) {
                return true;
            }

            var valid = true;
            var invalidFlds = [];

            if (typeof (path) != "undefined") {
                //only test this single field
                var member = this.memberMap[path];
                if (!this.isMemberValid(path, member)) {
                    valid = false;
                    invalidFlds.push({ member: path, msg: member._validateMsg });
                }
            }
            else {
                if (this.type == "Functional Class") {
                    //test all fields if we're a udv
                    var arrayParentPath;
                    for (var path in this.memberMap) {
                        var member = this.memberMap[path];

                        //check if this member is an ancestor of an array member, if so skip validation
                        if (path.lastIndexOf(arrayParentPath, 0) === 0) {
                            continue;
                        }
                        else {
                            arrayParentPath = null;
                        }

                        if (member.opts.array) {
                            arrayParentPath = path;
                            continue;
                        }

                        if (!this.isMemberValid(path, member)) {
                            valid = false;
                            invalidFlds.push({ member: path, msg: member._validateMsg });
                        }
                    }
                }
                else {
                    valid = this.isMemberValid("", this);
                    invalidFlds.push({ msg: this._validateMsg });
                }
            }

            $(this).trigger('validchanged', [valid, invalidFlds]);

            return valid;
        },

        isMemberValid: function (path, memInfo) {

            if (path.indexOf('.') != -1) {
                var lastDotIdx = path.lastIndexOf('.');
                var parentPath = path.substring(0, lastDotIdx);
                var parentMemInfo = this.memberMap[parentPath];
                if (parentMemInfo
                        && parentMemInfo.opts.array) {
                    return true;
                }
            }

            var valid = true;
            var val = this.getValue(path);

            //do built-in validation
            if (memInfo.type == "Number") {
                //make sure we have a proper number object, and
                //it's value is numeric
                if (typeof (val) == "undefined"
                        || typeof (val.IsNull) == "undefined"
                        || isNaN(val.Value)) {
                    valid = false;
                }
            }
            else if (memInfo.type == "Date/Time") {
                //Make sure we have a proper date object, and
                //it's value is non-null. Also check that getTime
                //returns a valid number, otherwise the date object 
                //represents an invalid date (we parsed a bad string).
                if (typeof (val) == "undefined"
                        || typeof (val.IsNull) == "undefined"
                        || typeof (val.Value) == "undefined"
                        || typeof (val.Value.getTime) != "function"
                        || isNaN(val.Value.getTime())) {
                    valid = false;
                }
            }

            if (!valid) {
                //failed bult-in validation
                memInfo._validateMsg = Td.Localization.resolveByKey("InvalidField");
                return false;
            }

            if (memInfo.opts.validation) {
                for (var idx = 0; idx < memInfo.opts.validation.rules.length; idx++) {
                    var rule = memInfo.opts.validation.rules[idx];
                    for (var prop in rule) {
                        var ruleVal = rule[prop];
                        switch (prop) {
                            case "IsRequired":

                                if (ruleVal) {
                                    if (typeof (val) == "undefined"
                                            || val == ""
                                            || val.IsNull) {
                                        valid = false;
                                    }
                                }

                                break;
                            case "IsLessThan":

                                if (typeof (val) != "undefined") {
                                    if (memInfo.type == "String"
                                            && val.length >= ruleVal) {
                                        valid = false;
                                    }
                                    else if (memInfo.type == "Number"
                                                && (isNaN(val.Value) || val.Value >= ruleVal)) {
                                        valid = false;
                                    }
                                }

                                break;
                            case "IsLessThanOrEqualTo":

                                if (typeof (val) != "undefined") {
                                    if (memInfo.type == "String"
                                            && val.length > ruleVal) {
                                        valid = false;
                                    }
                                    else if (memInfo.type == "Number"
                                                && (isNaN(val.Value) || val.Value > ruleVal)) {
                                        valid = false;
                                    }
                                }

                                break;
                            case "IsGreaterThan":

                                if (typeof (val) != "undefined") {
                                    if (memInfo.type == "String"
                                            && val.length <= ruleVal) {
                                        valid = false;
                                    }
                                    else if (memInfo.type == "Number"
                                                && (isNaN(val.Value) || val.Value <= ruleVal)) {
                                        valid = false;
                                    }
                                }

                                break;
                            case "IsGreaterThanOrEqualTo":

                                if (typeof (val) != "undefined") {
                                    if (memInfo.type == "String"
                                            && val.length < ruleVal) {
                                        valid = false;
                                    }
                                    else if (memInfo.type == "Number"
                                                && (isNaN(val.Value) || val.Value < ruleVal)) {
                                        valid = false;
                                    }
                                }

                                break;
                            case "IsEqualTo":

                                if (typeof (val) == "undefined"
                                        || val != ruleVal) {
                                    valid = false;
                                }

                                break;
                            case "IsNotEqualTo":

                                if (typeof (val) == "undefined"
                                        || val == ruleVal) {
                                    valid = false;
                                }

                                break;
                            case "IsMatching":
                                if (typeof (val) == "undefined") {
                                    valid = false;
                                }
                                else {
                                    var regex = new RegExp(ruleVal);
                                    if (!regex.test(val)) {
                                        valid = false;
                                    }
                                }
                                break;
                            case "EvaluateFunction":
                                valid = ruleVal(val);
                                break;
                        }
                    }

                    if (!valid) {
                        var msg = rule.message;
                        if (typeof (msg) == "undefined") {
                            msg = Td.Localization.resolveByKey("InvalidField");
                        }
                        else {
                            msg = Td.Localization.resolve(rule.message);
                        }
                        memInfo._validateMsg = msg;
                        break;
                    }
                }
            }

            return valid;
        },

        sort: function (path, direction) {
            if (!this.opts.array) {
                return false;
            }
            var memInfo = this.memberMap[path];
            this.value.sort(function (a, b) {
                var aVal = a[path];
                var bVal = b[path];

                if (memInfo.type == "Number"
                        || memInfo.type == "Date/Time") {
                    if (aVal.IsNull
                            && bVal.IsNull) {
                        return 0;
                    }
                    else if (aVal.IsNull) {
                        return direction == 1 ? -1 : 1;
                    }
                    else if (bVal.IsNull) {
                        return direction == 1 ? 1 : -1;
                    }
                    aVal = aVal.Value;
                    bVal = bVal.Value;
                }

                if (aVal > bVal) {
                    return direction == 1 ? 1 : -1;
                }
                if (aVal < bVal) {
                    return direction == 1 ? -1 : 1;
                }
                //equal
                return 0;
            });
            $(this).trigger('changed', [this.value]);
        },

        _getBinaryDeferred: function () {
            //Get jQuery deferred instances for all binary fields
            //which have File objects as their value (this indicates they were bound
            //do a file input).  This allows us to get the binary data server side.
            var binaryMemInfo = {};
            if (this.type == "Functional Class"
                    && !this.opts.array) {
                binaryMemInfo.deferredMems = [];
                //look for binary fields
                for (var path in this.memberMap) {
                    var member = this.memberMap[path];
                    if (member.type == "Binary") {

                        var val = this.getValue(path);
                        if (typeof (val) == "object"
                                && val instanceof File) {
                            binaryMemInfo.hasAsyncVals = true;

                            if (!binaryMemInfo.bindVal) {
                                //Create a cloned object so we don't modify this bind's fields.
                                //We can't pass File objects directly to an operation, so we need 
                                //to null the field out.
                                binaryMemInfo.bindVal = $.extend(true, {}, this.getValue());
                            }

                            //create a temp binary bind and get's its
                            //deferred val, this will initiate an upload.
                            var bBind = new Td.Data.BinaryBinding("__Bin_" + member, "Binary", { initval: null });
                            bBind.setValue(val);
                            binaryMemInfo.deferredMems.push(bBind.getDeferredValue([path]));

                            //null out value we pass to operation
                            binaryMemInfo.bindVal[path] = null;
                        }
                    }
                }
            }
            return binaryMemInfo;
        }
    })

};

/**
 * GeoBinding
 * @param {string} name - Use to lookup binding later
 * @param {string} datatype - The underlying TD type of this bind (Number, String, Functional Class)
 * @param {object} opts - Options for this bind (initial value etc.)
 * @class Td.Data.GeoBinding 
 * @classdesc Binding for looking up location.
 * @extends Td.Data.Binding
 */
Td.Data.GeoBinding = Td.Data.Binding.extend({

    init: function (name, datatype, opts) {
        this._super(name, datatype, opts);
        this.requiresAsync = true;
    },

    getValue: function (path) {

        if (this._geoCacheVal) {
            return this._geoCacheVal;
        }

        if (navigator.geolocation) {
            var _this = this;
            navigator.geolocation.getCurrentPosition(
                function (pos) { _this._gotLocValue(pos) },
                function (err) { _this._errGettingLocValue(err) }
                );
        }
        return "";
    },

    getDeferredValue: function (params) {
        var defGet = $.Deferred();
        if (navigator.geolocation) {
            var _this = this;
            navigator.geolocation.getCurrentPosition(
                function (pos) { _this._gotLocValue(pos, defGet, params) },
                function (err) { _this._errGettingLocValue(err, defGet, params) },
                {
                    timeout: 5000
                }
                );
        }
        else {
            defGet.reject(params);
        }
        return defGet;
    },


    _gotLocValue: function (pos, deferred, params) {
        var val = pos.coords.latitude + "," + pos.coords.longitude;
        this._geoCacheVal = val;
        this.setValue(val);

        if (deferred) {
            deferred.resolve(val, params);
        }
    },

    _errGettingLocValue: function (err, deferred, params) {
        if (deferred) {
            deferred.reject(params);
        }
    }
});

/**
 * BinaryBinding
 * @param {string} name - Use to lookup binding later
 * @param {string} datatype - The underlying TD type of this bind (Number, String, Functional Class)
 * @param {object} opts - Options for this bind (initial value etc.)
 * @class Td.Data.BinaryBinding 
 * @classdesc Binding used for binary data.
 * @extends Td.Data.Binding
 */
Td.Data.BinaryBinding = Td.Data.Binding.extend({

    init: function (name, datatype, opts) {
        this._super(name, datatype, opts);
        this.requiresAsync = true;
    },

    getDeferredValue: function (params) {
        var defGet = $.Deferred();

        var val = this.getValue();

        if (val == null
                || $.isArray(val)) {
            //don't bother uploading anything
            defGet.resolve(val, params);
            return defGet;
        }

        if (typeof (FormData) != "undefined") {
            var _this = this;
            var fileData = new FormData();

            if (this._scaledImgData) {
                var base64data = this._scaledImgData.substring(this._scaledImgData.indexOf(',') + 1);
                fileData.append("scaled:" + params[0], base64data);
            }
            else {
                fileData.append(params[0], val);
            }

            Td.Util.showWaitIcon();

            var uploadHandler = "FileUpload.ashx";
            if (Td.Util.isCordovaApp()) {
                uploadHandler = Td.Config.getAppURL() + "/" + uploadHandler;
            }

            $.ajax({
                type: "POST",
                data: fileData,
                url: uploadHandler,
                contentType: false,
                dataType: "json",
                processData: false
            })
            .done(function (data, textStatus, jqXHR) {
                defGet.resolve([], params);
            })
            .fail(function (e) {
                defGet.reject(params);
            });
        }
        else {
            defGet.reject(params);
        }
        return defGet;
    },

    scaleImage: function (factor) {
        var _this = this;
        var val = this.getValue();
        if (typeof (val) == "object"
                && val instanceof File) {

            //create tmp image
            var image = new Image();

            //on image load, scale using canvas
            image.onload = function () {
                var canvas = document.createElement("canvas");
                var ctx = canvas.getContext("2d");
                var scaledWidth = image.naturalWidth * factor;
                var scaledHeight = image.naturalHeight * factor;
                canvas.width = scaledWidth;
                canvas.height = scaledHeight;
                ctx.drawImage(image, 0, 0, scaledWidth, scaledHeight);
                _this._scaledImgData = canvas.toDataURL("image/jpeg");
            };

            //read file object into image
            var reader = new FileReader();
            reader.onload = function (e) {
                image.src = e.target.result;
            };
            reader.readAsDataURL(val);
        }
    }
});

//static fields/functions
Td.Data.Operation.opMap = {};

/**
 * Get a operation object by name
 * @param {string} name - The name of the operation to lookup.
 * @return {Td.Data.Operation} - The operation
 * @function
 * @memberof Td.Data.Operation
 */
Td.Data.Operation.get = function (name) {
    return Td.Data.Operation.opMap[name];
}

Td.Data.Operation.clear = function () {
    Td.Data.Operation.opMap = {};
}

Td.Data.Binding.bindMap = {};
/**
 * Get a binding object by name
 * @param {string} name - The name of the bind to lookup.
 * @return {Td.Data.Binding} - The binding
 * @function
 * @memberof Td.Data.Binding
 */
Td.Data.Binding.get = function (name) {
    return Td.Data.Binding.bindMap[name];
}

Td.Data.Binding.clear = function () {
    //only clear non-system binds
    for (var key in Td.Data.Binding.bindMap) {
        var bind = Td.Data.Binding.bindMap[key];
        if (!bind.opts.isSystemBind) {
            delete Td.Data.Binding.bindMap[key];
        }
    }
}

/**
 * TD control classes.
 * @namespace Td.Controls
 */
Td.Controls = {


    Control: Class.extend({
        type: "nothing",
        id: "",

        /**
         * TD.Controls.Control
         * @constructs Td.Controls.Control
         * @classdesc Base class for all client side controls.
         * @param {string} id - The unique ID of the control.
         * @param {object} options - Options for this control
         */
        init: function (id, options) {

            this.id = id;
            this.options = options;

            var dElem = $(this.getJQMId());
            var bindAttr = options.binding;

            Td.Controls.controlMap[id] = this;

            var _this = this;

            if (typeof (bindAttr) != "undefined") {
                this.bindSetting = $.extend({ direction: "getset" }, bindAttr);
                this.binding = Td.Data.Binding.get(this.bindSetting.source);

                if (this.bindSetting.direction == "getset"
					|| this.bindSetting.direction == "get") {

                    if (this.binding.hasNonDefaultInitValue) {
                        _this.updateValue(_this.resolveBindingValue(this.binding.getValue(), this.bindSetting));
                    }

                    $(this.binding).on(
						'changed',
						function (evt, value, path) { _this.handleValueBindChanged(value, path) }
						);
                }

                $(this.binding).on(
						'validchanged',
						function (evt, isValid, invalidPaths) { _this.handleValidateChanged(isValid, invalidPaths) }
						);
            }

            if (typeof (options.visbinding) != "undefined") {
                var visBind = Td.Data.Binding.get(options.visbinding.source);

                _this.updateVisibility(this.resolveBoolValue(visBind, options.visbinding));

                $(visBind).on(
					'changed',
					function (evt, value) { _this.updateVisibility(_this.resolveBoolValue(visBind, options.visbinding)) }
					);
            }

            if (typeof (options.enabledbinding) != "undefined") {
                var enabledBind = Td.Data.Binding.get(options.enabledbinding.source);

                _this.updateEnabled(this.resolveBoolValue(enabledBind, options.enabledbinding))

                $(enabledBind).on(
					'changed',
					function (evt, value) { _this.updateEnabled(_this.resolveBoolValue(enabledBind, options.enabledbinding)) }
					);
            }

            if (options && options.caption) {
                this.captionMap = options.caption;
                this.lookupCaption();

                $(Td.Localization).on(
						'localechanged',
						function (evt) { _this.lookupCaption() }
						);
            }

            if (options && options.create) {
                options.create();
            }

            if (options.swipeleft) {
                $(this.getJQMId()).on(
						'swipeleft',
						function (evt) { options.swipeleft() }
						);
            }

            if (options.swiperight) {
                $(this.getJQMId()).on(
						'swiperight',
						function (evt) { options.swiperight() }
						);
            }
        },

        /**
         * Updates visibility of this control
         * @param {bool} value - True to show control, false to hide
         * @function
         * @instance
         * @memberof Td.Controls.Control
         */
        updateVisibility: function (value) {
            var node = $(this.getJQMId());
            if (value) {
                node.show();
                node.parents("#" + this.id + "_container").show();
            }
            else {
                node.hide();
                node.parents("#" + this.id + "_container").hide();
            }
        },

        /**
         * Updates the enabled state of this control
         * @param {bool} value - True to enable control, false to disable
         * @function
         * @instance
         * @memberof Td.Controls.Control
         */
        updateEnabled: function (value) {
            $(this.getJQMId()).prop("disabled", value);
        },

        resolveBoolValue: function (bindObj, bindSetting, arrayItem) {
            var boolVal = bindObj.boolValue(bindSetting.path, arrayItem);
            if (bindSetting.inverse) {
                boolVal = !boolVal;
            }
            return boolVal;
        },

        resolveBindingValue: function (bindObj, bindSetting) {
            var value = bindObj;
            var bindType = Td.Data.Binding.get(bindSetting.source).getType(bindSetting.path);

            if (bindSetting.path) {
                var pathElems = bindSetting.path.split(".");
                for (var idx = 0; idx < pathElems.length; idx++) {
                    if (typeof (value) == "undefined" || value == null) {
                        break;
                    }
                    value = value[pathElems[idx]];
                }
            }

            if (typeof (value) == "undefined" || value == null) {
                value = '';
            }
            else if (bindType == "Number"
                    || bindType == "Date/Time") {
                if (value.IsNull) {
                    value = '';
                }
                else {
                    if (bindSetting.format) {
                        if (bindType == "Date/Time") {
                            value = $.format.date(value.Value, bindSetting.format);
                        }
                        else {
                            value = value.Value;
                        }
                    }
                    else {
                        value = value.Value;
                    }
                }
            }

            return value;
        },

        /**
         * Updates the value of this control
         * @param {string} value - The new value
         * @function
         * @instance
         * @memberof Td.Controls.Control
         */
        updateValue: function (value) {
            $(this.getJQMId()).val(value);
        },

        updateBindingSource: function (value) {
            if (typeof (this.binding) != "undefined") {
                if (typeof (this.options.bindHook) != "undefined") {
                    if (!this.options.bindHook(value)) {
                        return;
                    }
                }
                try {
                    this._updatingBindSource = true;
                    this.binding.setValue(value, this.bindSetting.path);
                }
                finally {
                    this._updatingBindSource = false;
                }
            }
        },

        /**
         * Get's the jQuery selector for this control
         * @return {string} - A selector that can be used by jQuery
         * @function
         * @instance
         * @memberof Td.Controls.Control
         */
        getJQMId: function () {
            return "#" + Td.Controls._currPage.id + " #" + this.id;
        },

        lookupCaption: function () {
            var caption = Td.Localization.resolve(this.captionMap);
            this.setCaption(caption);
        },

        /**
         * Updates the caption of this control
         * @param {string} value - The new caption
         * @function
         * @instance
         * @memberof Td.Controls.Control
         */
        setCaption: function (value) {
            var labels = $("label[for='" + this.id + "']");
            if (labels.length > 0) {
                $(labels[0]).text(value);
            }
        },

        /**
         * Gets the caption of this control
         * @return {string} - The current caption
         * @function
         * @instance
         * @memberof Td.Controls.Control
         */
        getCaption: function () {
            var labels = $("label[for='" + this.id + "']");
            if (labels.length > 0) {
                return $(labels[0]).text();
            }
        },

        handleValueBindChanged: function (value, path) {
            if (!this._updatingBindSource) {
                if (!path || path == this.bindSetting.path) {
                    this.updateValue(this.resolveBindingValue(value, this.bindSetting));
                }
            }
        },

        handleValidateChanged: function (isValid, invalidPaths) {

            var _this = this;
            var errLabelId = "__errlabel_" + this.id;
            var errLabel = $("#" + errLabelId);

            var thisFldInfo;

            if (!isValid) {
                if (!this.bindSetting.path) {
                    //bound to a simple bind, should only be one item
                    //in invalid path arr
                    thisFldInfo = invalidPaths[0];
                }
                else {
                    var matches = $.grep(
                                    invalidPaths,
                                    function (item) {
                                        if (item.member == _this.bindSetting.path) {
                                            return true;
                                        }
                                        return false;
                                    });
                    if (matches.length > 0) {
                        thisFldInfo = matches[0];
                    }
                }
            }

            if (thisFldInfo) {
                if (!errLabel.length) {
                    errLabel = $("<label>")
                                    .attr("for", this.id)
                                    .attr("id", errLabelId)
                                    .addClass("error")
                                    .html(thisFldInfo.msg);

                    var dElem = $(this.getJQMId());
                    errLabel.insertAfter(dElem.parent());
                }
                else {
                    errLabel.html(thisFldInfo.msg);
                }
            }
            else {
                if (errLabel.length) {
                    errLabel.remove();
                }
            }
        }
    })
};

Td.Controls.controlMap = {};

/**
 * Get a control reference by name
 * @param {string} name - The name of the control to lookup.
 * @return {Td.Data.Control} - The control
 * @function
 * @memberof Td.Controls
 */
Td.Controls.get = function (id) {
    return Td.Controls.controlMap[id];
}
Td.Controls.clear = function () {
    Td.Controls.controlMap = {};
}

/**
 * Page
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Page
 * @classdesc Client side page control.
 * @extends Td.Controls.Control
 */
Td.Controls.Page = Td.Controls.Control.extend({
    type: "page",

    init: function (id, options) {
        Td.Controls._currPage = this;
        this._super(id, options);
    },

    getJQMId: function () {
        return " #" + this.id;
    },

    setCaption: function (value) {
        document.title = value;
    },

    getCaption: function () {
        return document.title;
    },

    executeTimer: function () {
        if (this.options.timer) {
            this.options.timer();
        }
    },

    raiseCreateComplete: function () {
        if (this.options.createcomplete) {
            this.options.createcomplete();
        }
    },

    raiseError: function (msg, code, opName, excType) {
        var errBind = Td.Data.Binding.get('[error]');
        errBind.setValue(msg, 'message');
        errBind.setValue(code, 'code');
        errBind.setValue(opName, 'operation');
        errBind.setValue(excType, 'type');

        if (this.options.error) {
            this.options.error();
            return true;
        }
        return false;
    },

    raiseOrientationChange: function () {
        if (this.options.orientationchange) {
            this.options.orientationchange();
        }
    },

    raiseOnlineStatusChanged: function () {
        if (this.options.onlinestatuschange) {
            this.options.onlinestatuschange();
        }
    },

    raiseEvent: function (evtName) {
        this.options[evtName]();
    }
});

/**
 * Dialog
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Dialog
 * @classdesc Client side dialog control.
 * @extends Td.Controls.Control
 */
Td.Controls.Dialog = Td.Controls.Control.extend({
    type: "dialog",

    init: function (id, options) {
        this._super(id, options);
        var _this = this;
        $(this.getJQMId()).popup({

            beforeposition: function () {

                var width = _this.options.width;
                var height = _this.options.height;

                if (_this.options.percentsize) {
                    width = window.innerWidth * (width / 100);
                    height = window.innerHeight * (height / 100);
                }

                $(this).css({
                    width: width + "px",
                    height: height + "px"
                });
            },

            afteropen: function (event, ui) {
                if (_this.options.dialogopened) {
                    _this.options.dialogopened();
                }
                $(_this).trigger('dialogopened');
            },

            afterclose: function (event, ui) {
                if (_this.options.dialogclosed) {
                    _this.options.dialogclosed();
                }

                if (_this.dialogResult === true && _this.onOkCallback) {
                    _this.onOkCallback();
                }
                else if (_this.onCancelCallback) {
                    _this.onCancelCallback();
                }
            }
        });
    },

    getJQMId: function () {
        return " #" + this.id;
    },

    show: function (onOk, onCancel) {
        this.dialogResult = false;
        this.onOkCallback = onOk;
        this.onCancelCallback = onCancel;
        $(this.getJQMId()).popup("open");
    },

    close: function (result, returnData) {
        this.dialogResult = result;
        this.dialogReturnData = returnData;
        $(this.getJQMId()).popup("close");
    },

    getDialogReturnData: function () {
        return this.dialogReturnData;
    },

    raiseEvent: function (evtName) {
        this.options[evtName]();
    }
});

/**
 * Toolbar
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Toolbar
 * @classdesc Client side toolbar control.
 * @extends Td.Controls.Control
 */
Td.Controls.Toolbar = Td.Controls.Control.extend({
    type: "toolbar",

    getJQMId: function () {
        return "#" + Td.Controls._currPage.id + " #\\" + this.id;
    },

    setCaption: function (value) {
        var headerNode = $(this.getJQMId());
        if (headerNode.length > 0) {
            var h1 = headerNode.find("h1")[0];
            $(h1).text(value);
        }
    },

    getCaption: function () {
        var headerNode = $(this.getJQMId());
        if (headerNode.length > 0) {
            var h1 = headerNode.find("h1")[0];
            return $(h1).text();
        }
    },

    updateValue: function (value) {
        this.setCaption(value);
    }
});

/**
 * Picture
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Picture
 * @classdesc Client side picture control.
 * @extends Td.Controls.Control
 */
Td.Controls.Picture = Td.Controls.Control.extend({
    type: "picture",
    init: function (id, options) {
        this._super(id, options);

        if (options.click) {
            $(this.getJQMId()).click(
                function () {
                    options.click();
                });
        }
    },
    updateValue: function (value) {
        //if it's an array, base64 encode the value
        if (typeof (value) == "object"
                && Array.isArray(value)) {
            var strBuff = "";
            for (var idx = 0; idx < value.length; idx++) {
                strBuff += String.fromCharCode(value[idx]);
            }
            var base64val = btoa(strBuff);
            value = "data:image/jpg;base64," + base64val;
        }
        else if (typeof (value) == "object"
                && value instanceof File) {
            var _this = this;
            var reader = new FileReader();
            reader.onload = function (e) {
                $(_this.getJQMId()).attr('src', e.target.result);
            };
            reader.readAsDataURL(value);
        }

        $(this.getJQMId()).attr('src', value);
    }
});

/**
 * Map
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Map
 * @classdesc Client side Map control.
 * @extends Td.Controls.Control
 */
Td.Controls.Map = Td.Controls.Control.extend({
    type: "map",

    init: function (id, options) {
        this._super(id, options);

        var listBindingAttr = options.listbinding;
        var _this = this;

        if (typeof (listBindingAttr) != "undefined") {
            this.listBinding = new Td.Data.Binding.get(listBindingAttr.source);
            $(this.listBinding).on(
					'changed',
					function (evt, value) { _this.populateMarkers(value) }
					);
        }

        var _this = this;

        var pPopup = $(this.getJQMId()).parent("div[data-role='popup']");
        if (pPopup.length > 0) {
            //child of a dialog
            var dlgControl = Td.Controls.get(pPopup[0].id);
            $(dlgControl).on("dialogopened", function () {
                setTimeout(
                    function () { _this._initMap() },
                    100);
            });
        }
        else {
            $(document).one("pageshow", function (event) {
                setTimeout(
                    function () { _this._initMap() },
                    100);
            });
        }

    },

    _initMap: function () {
        $(this.getJQMId()).gmap();
        this.mapSetup = true;
    },

    updateValue: function (value) {
        if (!this.mapSetup) {
            var _this = this;
            setTimeout(
                function () { _this.updateValue(value) },
                100);
            return;
        }
        if (value) {
            var parts = value.split(',');
            if (parts.length == 2) {
                var map = $(this.getJQMId()).gmap('get', 'map');
                map.setCenter(new google.maps.LatLng(parts[0], parts[1]));
                map.setZoom(10);
            }
        }
    },

    populateMarkers: function (markerData) {
        if (!this.mapSetup) {
            var _this = this;
            setTimeout(
                function () { _this.populateMarkers(markerData) },
                100);
            return;
        }
        var node = $(this.getJQMId());
        if (markerData) {
            node.gmap('clear', 'markers');
            for (var idx = 0; idx < markerData.length; idx++) {
                var marker = markerData[idx];

                var mLat = 0;
                var mLong = 0;
                var content = "";

                if (marker[this.options.markerLatField]) {
                    mLat = marker[this.options.markerLatField].Value;
                }
                if (marker[this.options.markerLongField]) {
                    mLong = marker[this.options.markerLongField].Value;
                }
                if (marker[this.options.markerContentField]) {
                    content = marker[this.options.markerContentField];
                }

                var clickHandler = (function () {
                    var mContent = content;
                    return function () {
                        node.gmap("openInfoWindow", { 'content': mContent }, this);
                    }
                })();

                node.gmap(
				    'addMarker',
				    {
				        'position': new google.maps.LatLng(mLat, mLong),
				        'bounds': true

				    }).click(clickHandler);
            }
        }

    }
});

/**
 * Graph
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Graph
 * @classdesc Client side chart control.
 * @extends Td.Controls.Control
 */
Td.Controls.Graph = Td.Controls.Control.extend({
    type: "graph",
    init: function (id, options) {
        this._super(id, options);
    },

    updateValue: function (value) {

        $(this.getJQMId()).empty();

        var data = [];
        var chartOpts = {};
        var seriesOpts = [];

        if (this.options.type == "Meter") {
            if (this.options.series.length == 1) {
                var sInfo = this.options.series[0];
                if (sInfo.yfield == "") {
                    return;
                }
                var yArr = value[sInfo.yfield];
                if ($.isArray(yArr) && yArr.length == 1) {
                    yArr = this._convertSalTypes(yArr);
                    data.push(yArr);
                }
                else {
                    return;
                }
            }
        }
        else {
            for (var idx = 0; idx < this.options.series.length; idx++) {
                var sInfo = this.options.series[idx];
                var sOpts = { label: sInfo.label };

                if (sInfo.yfield == "") {
                    return;
                }

                if ((sInfo.xfield != "" && !$.isArray(value[sInfo.xfield]))
                        || (sInfo.yfield != "" && !$.isArray(value[sInfo.yfield]))) {
                    return;
                }

                var yArr = this._convertSalTypes(value[sInfo.yfield]);
                var xArr = [];
                if (sInfo.xfield != "") {
                    xArr = this._convertSalTypes(value[sInfo.xfield]);
                }
                else {
                    //if no x axis field, fill with default values
                    if (this.options.type == "Line"
                            || this.options.type == "Bar") {
                        //fill x axis with sequential nums
                        for (var yIdx = 0; yIdx < yArr.length; yIdx++) {
                            xArr[yIdx] = yIdx + 1;
                        }
                    }
                    else if (this.options.type == "Pie") {
                        //fill with empty labels
                        for (var yIdx = 0; yIdx < yArr.length; yIdx++) {
                            xArr[yIdx] = "";
                        }
                    }
                }

                var sData = [];

                for (var xIdx = 0; xIdx < xArr.length; xIdx++) {
                    sData.push([xArr[xIdx], yArr[xIdx]]);
                }

                data.push(sData);
                seriesOpts.push(sOpts);
            }
        }

        chartOpts.seriesDefaults = {};

        if (this.options.type != "Line") {
            var renderObj;
            switch (this.options.type) {
                case "Bar":
                    renderObj = $.jqplot.BarRenderer;
                    break;
                case "Meter":
                    renderObj = $.jqplot.MeterGaugeRenderer;
                    break;
                case "Pie":
                    renderObj = $.jqplot.PieRenderer;
                    chartOpts.seriesDefaults.rendererOptions = { showDataLabels: true };
                    break;
            }
            chartOpts.seriesDefaults.renderer = renderObj;
        }

        chartOpts.title = this.options.title;
        chartOpts.series = seriesOpts;

        if (this.options.type != "Meter") {
            chartOpts.seriesDefaults.pointLabels = { show: true };
            chartOpts.legend = {
                show: true
            };
        }

        chartOpts.grid = {
            //todo: if use parent, set to transparent, otherwise allow custom bg color
            background: 'transparent'
        }

        chartOpts.axes = {
            xaxis: {
                label: this.options.xlabel
            },
            yaxis: {
                label: this.options.ylabel
            }
        };

        if (this.options.xAxisTicks) {
            var ticks = value[this.options.xAxisTicks];
            ticks = this._convertSalTypes(ticks);

            if (this.options.type == "Meter") {
                chartOpts.seriesDefaults.rendererOptions = { ticks: ticks };
            }
            else {
                chartOpts.axes.xaxis.ticks = ticks;
                chartOpts.axes.xaxis.renderer = $.jqplot.CategoryAxisRenderer;
            }
        }

        if (data.length == 0) {
            return;
        }

        var chartId = this.getJQMId().substring(1);

        this._jqChart = $.jqplot(chartId, data, chartOpts);

        //jqplot doesn't like to initiailze before pageshow JQM event (which can happen if Invoke returns quickly from Create).
        //So listen once for pageshow, and replot if it's raised on this page.
        //If the control map doesn't hold a reference to us, it's because this event was fired after navigating away.
        var _this = this;
        $(document).one("pageshow", function (event) {
            if (Td.Controls.get(_this.id) == _this) {
                $(_this.getJQMId()).css('width', '').css('height', '').empty();
                _this._jqChart = $.jqplot(chartId, data, chartOpts);
            }
        });
    },

    updateVisibility: function (value) {
        this._super(value);
        if (value && this._jqChart) {
            this._jqChart.replot({ resetAxes: true });
        }
    },

    refresh: function () {
        this._jqChart.replot({ resetAxes: true });
    },

    //Converts array of sal numbers/dates to native values
    _convertSalTypes: function (salArr) {
        var newArr = [];
        for (var idx = 0; idx < salArr.length; idx++) {
            if (typeof (salArr[idx].Value) != "undefined") {
                newArr[idx] = salArr[idx].Value;
            } else {
                newArr[idx] = salArr[idx];
            }
        }
        return newArr;
    }
});

/**
 * TextBox
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.TextBox
 * @classdesc Client side datafield control.
 * @extends Td.Controls.Control
 */
Td.Controls.TextBox = Td.Controls.Control.extend({
    type: "textbox",
    init: function (id, options) {
        this._super(id, options);
        var _this = this;

        if (this.bindSetting
				&& (this.bindSetting.direction == "getset"
				|| this.bindSetting.direction == "set")) {
            if ($(this.getJQMId()).attr('type') == "file") {
                var bind = Td.Data.Binding.get(this.bindSetting.source);
                var bType = bind.getType(this.bindSetting.path);
                if (bType == "Binary") {
                    $(this.getJQMId()).on('change', function () {
                        var files = $(_this.getJQMId()).prop('files');
                        if (files.length > 0) {
                            bind.setValue(files[0], _this.bindSetting.path);
                            if (files[0].type == "image/jpeg"
                                    && typeof (_this.options.scaleImgFactor) != "undefined") {
                                bind.scaleImage(_this.options.scaleImgFactor);
                            }
                        }
                    });
                }

                //file input won't raise input event
                if (this.options.change) {
                    $(this.getJQMId()).on('change', function () {
                        _this.options.change();
                    });
                }
            }
            else {
                $(this.getJQMId()).on('input change', function () {
                    _this.updateBindingSource($(_this.getJQMId()).val());
                });
            }
        }

        if (this.options.change) {
            $(this.getJQMId()).on('input', function () {
                _this.options.change();
            });
        }

        if (this.options.endedit) {
            $(this.getJQMId()).on('blur', function () {
                _this.options.endedit();
            });
        }

        if (options && options.placeholder) {
            this.placeholderMap = options.placeholder;
            this.lookupPlaceholder();

            $(Td.Localization).on(
                    'localechanged',
                    function (evt) { _this.lookupPlaceholder() }
                    );
        }
    },

    lookupPlaceholder: function () {
        var placeholder = Td.Localization.resolve(this.placeholderMap);
        $(this.getJQMId()).attr("placeholder", placeholder);
    },

    updateValue: function (value) {
        var jObj = $(this.getJQMId());
        if ((typeof (value) == "object"
                && value instanceof File) || $.isArray(value)) {
            //ignore updates to binary bind
        }
        else {
            if (jObj.attr('type') == "date") {
                value = $.format.date(value, "yyyy-MM-dd");
            }
            else if (jObj.attr('type') == "datetime-local") {
                value = $.format.date(value, "yyyy-MM-ddTHH:mm");
            }
            else if (jObj.attr('type') == "time") {
                value = $.format.date(value, "HH:mm");
            }

            if (typeof (value) == "number"
                    && jObj.attr('type') == "text") {
                value = Td.Localization.formatNumber(value);
            }

            jObj.val(value);

            if (jObj.is("textarea")) {
                //refresh will cause textarea to re-adjust its height based
                //on the amount of text
                jObj.textinput("refresh");
            }
        }
    },

    updateEnabled: function (value) {
        if (value) {
            $(this.getJQMId()).textinput("enable");
        }
        else {
            $(this.getJQMId()).textinput("disable");
        }
    }
});

/**
 * Button
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Button
 * @classdesc Client side button control.
 * @extends Td.Controls.Control
 */
Td.Controls.Button = Td.Controls.Control.extend({
    type: "button",
    init: function (id, options) {
        this._super(id, options);
        var dElem = $(this.getJQMId());
        var _this = this;
        if (options) {
            if (options.click) {
                dElem.click(function () {
                    if ($(this).attr('disabled') != 'disabled') {
                        options.click();
                    }
                });
            }
        }

        if (dElem.attr('disabled') == 'disabled') {
            this.updateEnabled(false);
        }
    },

    setCaption: function (value) {
        $(this.getJQMId()).text(value);
    },

    getCaption: function () {
        return $(this.getJQMId()).text();
    },

    updateEnabled: function (value) {
        if (value) {
            $(this.getJQMId()).removeClass('ui-disabled');
            $(this.getJQMId()).attr("tabindex", "");
            $(this.getJQMId()).removeAttr("disabled");
        }
        else {
            $(this.getJQMId()).addClass('ui-disabled');
            $(this.getJQMId()).attr("tabindex", "-1");
            $(this.getJQMId()).attr("disabled", "disabled");
        }
    }
});

/**
 * GroupBox
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.GroupBox
 * @classdesc Client side group box control.
 * @extends Td.Controls.Control
 */
Td.Controls.GroupBox = Td.Controls.Control.extend({
    type: "groupbox"
});

/**
 * LayoutGrid
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.LayoutGrid
 * @classdesc Client side layout grid control.
 * @extends Td.Controls.Control
 */
Td.Controls.LayoutGrid = Td.Controls.Control.extend({
    type: "layoutgrid"
});

/**
 * Frame
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Frame
 * @classdesc Client side frame control.
 * @extends Td.Controls.Control
 */
Td.Controls.Frame = Td.Controls.Control.extend({
    type: "frame",

    init: function (id, options) {
        this._super(id, options);
        if (options) {
            if (options.click) {
                var dElem = $(this.getJQMId());
                dElem.click(function () {
                    options.click();
                });
            }
        }
    }
});

/**
 * ProgressBar
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.ProgressBar
 * @classdesc Client side meter control.
 * @extends Td.Controls.Control
 */
Td.Controls.ProgressBar = Td.Controls.Control.extend({
    type: "meter"
});

/**
 * HtmlHost
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.HtmlHost
 * @classdesc Client side html host control.
 * @extends Td.Controls.Control
 */
Td.Controls.HtmlHost = Td.Controls.Control.extend({
    type: "htmlhost"
});

/**
 * Menu
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Menu
 * @classdesc Client side menu control.
 * @extends Td.Controls.Control
 */
Td.Controls.Menu = Td.Controls.Control.extend({
    type: "menu",

    init: function (id, options) {
        this._super(id, options);
        var menu = $(this.getJQMId());
        var _this = this;

        for (var idx = 0; idx < options.items.length; idx++) {
            var menuItem = options.items[idx];
            var listview = $(this.getJQMId() + " #" + menuItem.listviewId);

            if (menuItem.isList) {
                //create controls for items in the template
                if (!menuItem.listbinding) {
                    //no list binding defined
                    return;
                }
                var clickHandler;
                if (menuItem.action) {
                    clickHandler = (function (action) {
                        return function () { action(); }
                    })(menuItem.action);
                }

                //create label control
                var labelCtrl = new Td.Controls.Label(
                        menuItem.name + "_template_label",
                        {
                            binding: { source: menuItem.listbinding.source, path: menuItem.displayMemberPath }
                        });

                if (menuItem.iconPath) {
                    //create picture control
                    var picCtrl = new Td.Controls.Picture(
                        menuItem.name + "_template_image",
                        {
                            binding: { source: menuItem.listbinding.source, path: menuItem.iconPath }
                        });
                }

                //create a listview control for the node
                var listviewCtrl = new Td.Controls.ListView(
						menuItem.listviewId,
						{
						    click: function () {
						        //handle click
						        if (clickHandler) {
						            clickHandler();
						        }
						    },
						    binding: menuItem.binding,
						    listbinding: menuItem.listbinding
						}
					);
            }
            else {
                var liNode = $("<li></li>");
                var gridNode;
                if (menuItem.icon) {
                    gridNode = $("<div class='ui-grid-a'></div>");
                    gridNode.append("<div class='ui-block-a'><img src='" + menuItem.icon + "' class='tdm-menu-icon'/></div>");
                    gridNode.append("<div class='ui-block-b'><div id='" + menuItem.name + "_label'>" + Td.Localization.resolve(menuItem.caption) + "</div></div>");
                }

                if (menuItem.action) {
                    var aNode = $("<a></a>").attr("href", "#").attr("id", menuItem.name + "_label");
                    aNode.click((function (action) {
                        return function () { action(); }
                    })(menuItem.action));

                    if (menuItem.icon) {
                        aNode.append(gridNode);
                    }
                    else {
                        aNode.text(Td.Localization.resolve(menuItem.caption));
                    }

                    liNode.append(aNode);
                }
                else {
                    if (menuItem.icon) {
                        liNode.append(gridNode);
                    }
                    else {
                        liNode.attr("id", menuItem.name + "_label");
                        liNode.text(Td.Localization.resolve(menuItem.caption));
                    }
                }

                if (menuItem.visbinding) {

                    var visBind = new Td.Data.Binding.get(menuItem.visbinding.source);
                    if (this.resolveBoolValue(visBind, menuItem.visbinding)) {
                        liNode.show();
                    }
                    else {
                        liNode.hide();
                    }

                    (function (bind, bindSetting, itemNode) {
                        $(bind).on(
                            'changed',
                            function (evt, value) {
                                if (_this.resolveBoolValue(bind, bindSetting)) {
                                    itemNode.show();
                                }
                                else {
                                    itemNode.hide();
                                }
                            });
                    })(visBind, menuItem.visbinding, liNode);
                }

                if (menuItem.enabledbinding) {

                    var enabledBind = new Td.Data.Binding.get(menuItem.enabledbinding.source);
                    if (this.resolveBoolValue(enabledBind, menuItem.enabledbinding)) {
                        liNode.removeClass('ui-disabled');
                    }
                    else {
                        liNode.addClass('ui-disabled');
                    }

                    (function (bind, bindSetting, itemNode) {
                        $(bind).on(
                            'changed',
                            function (evt, value) {
                                if (_this.resolveBoolValue(bind, bindSetting)) {
                                    itemNode.removeClass('ui-disabled');
                                }
                                else {
                                    itemNode.addClass('ui-disabled');
                                }
                            });
                    })(enabledBind, menuItem.enabledbinding, liNode);
                }


                listview.append(liNode);
                listview.listview("refresh");
            }
        }

        $(Td.Localization).on(
            'localechanged',
            function (evt) { _this.lookupCaption() }
            );
    },

    setCaption: function (value) {
        for (var idx = 0; idx < this.options.items.length; idx++) {
            var menuItem = this.options.items[idx];
            if (!menuItem.isList) {
                var itemCaption = Td.Localization.resolve(menuItem.caption);
                if (menuItem.icon) {
                    $("#" + Td.Controls._currPage.id + " div#" + menuItem.name + "_label").text(itemCaption);
                }
                else {
                    $("#" + Td.Controls._currPage.id + " #" + menuItem.name + "_label").text(itemCaption);
                }
            }
        }
    }
});

/**
 * Table
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Table
 * @classdesc Client side table control.
 * @extends Td.Controls.Control
 */
Td.Controls.Table = Td.Controls.Control.extend({
    type: "table",

    init: function (id, options) {
        this._super(id, options);
        var dElem = $(this.getJQMId());
        var listBindingAttr = options.listbinding;
        var _this = this;
        this._maxRowId = 0;

        this._updatedRecords = {};
        this._deletedRecords = {};
        this._addedRecords = {};

        if (typeof (listBindingAttr) != "undefined") {
            this.listBinding = new Td.Data.Binding.get(listBindingAttr.source);
            $(this.listBinding).on(
					'changed',
					function (evt, value) { _this.updateItemsFromBind(value) }
					);
        }

        //find columns that are sortable
        var cols = dElem.find("th.sortable");
        for (var idx = 0; idx < cols.length; idx++) {
            var col = $(cols[idx]);
            col.click((function (col) {
                return function () {

                    //remove sort from other cols
                    for (var idx = 0; idx < cols.length; idx++) {
                        $(cols[idx]).removeClass("sortdesc");
                        $(cols[idx]).removeClass("sortasc");
                    }

                    var sortState = col.data("sortstate");
                    var sortFld = col.data("sortfield");
                    if (typeof (sortState) == "undefined"
                            || sortState == "desc") {
                        col.addClass("sortasc");
                        col.data("sortstate", "asc");
                        _this.listBinding.sort(sortFld, 1);
                    }
                    else {
                        col.addClass("sortdesc");
                        col.data("sortstate", "desc");
                        _this.listBinding.sort(sortFld, 0);
                    }
                }
            })(col));
        }


        //find first row to use as template
        var tmplNode = dElem.find("tbody tr");

        if (this.options.allowUpdate) {
            var editActions = '<div id="' + id + '_editactions" data-role="controlgroup" data-type="horizontal">' +
					'<a href="#" id="' + id + '_savebtn" data-role="button" data-mini="true" data-icon="check" data-iconpos="left">Save</a>';
            if (this.options.allowAdd) {
                editActions += '<a href="#" id="' + id + '_addbtn" data-role="button" data-mini="true" data-icon="plus" data-iconpos="left">Add</a>';
            }
            editActions += '</div>';
            var node = dElem.before(editActions);
            $("#" + id + "_editactions").parent().enhanceWithin();

            $("#" + id + "_savebtn").click(function () {
                _this.saveChanges();
            });

            if (this.options.allowAdd) {
                $("#" + id + "_addbtn").click(function () {
                    _this.addRow();
                });
            }
        }

        if (this.options.allowDelete) {
            //add delete col header
            dElem.find("thead tr").prepend("<th id='table1_col_actions'></th>");
            //modify row template
            tmplNode.prepend("<td style='width:40px'><a href='#' class='tdmtable_delete_row' data-role='button' data-mini='true' data-icon='delete' data-iconpos='notext'></a></td>")
        }

        if (tmplNode.length > 0) {
            this.listItemTemplate = tmplNode;
            this.templateBoundNodes = [];

            //find all data bound items in the template
            var _this = this;
            var childNodes = tmplNode.find('*');
            $.each(childNodes, function (idx, cNode) {
                var idAttr = $(cNode).attr('id');
                if (typeof (idAttr) != "undefined") {
                    var ctrl = Td.Controls.get(idAttr);
                    if (ctrl && ctrl.binding) {
                        _this.templateBoundNodes.push(ctrl);
                    }
                }
            });
        }

        if (this.listBinding
                && this.listBinding.hasNonDefaultInitValue) {
            this.updateItemsFromBind(this.listBinding.getValue(listBindingAttr.path));
        }

        this.lookupCaption();

        $(Td.Localization).on(
            'localechanged',
            function (evt) { _this.lookupCaption() }
            );

        if (!options.allowColumnToggle) {
            //hide column toggle button
            $("a[href='#" + id + "-popup']").hide();
        }
    },

    updateVisibility: function (value) {
        this._super(value);
        if (this.options.allowColumnToggle) {
            if (value) {
                $("a[href='#" + this.id + "-popup']").show();
            }
            else {
                $("a[href='#" + this.id + "-popup']").hide();
            }
        }
    },

    updateItemsFromBind: function (value) {

        this._updatedRecords = {};
        this._deletedRecords = {};
        this._addedRecords = {};

        var dElem = $(this.getJQMId());
        var tBody = dElem.find("tbody");
        var _this = this;
        tBody.empty();
        if (value && $.isArray(value)) {

            for (var idx = 0; idx < value.length; idx++) {
                var item = value[idx];
                this._renderRow(item);
            }
        }

        dElem.table("rebuild");
    },

    _renderRow: function (dataItem, prepend) {
        var _this = this;
        this._maxRowId++;
        var currRowId = this._maxRowId;
        var rowId = this.id + "_row_" + currRowId;

        var dElem = $(this.getJQMId());
        var tBody = dElem.find("tbody");

        //clone the template node, remove display:none
        var clonedNode = this.listItemTemplate.clone();
        clonedNode.css('display', '');
        clonedNode.data('dataItem', dataItem);
        clonedNode[0].id = rowId;

        $(clonedNode).enhanceWithin();

        if (prepend) {
            tBody.prepend(clonedNode);
        } else {
            tBody.append(clonedNode);
        }

        if (this.options.allowDelete) {
            clonedNode.find(".tdmtable_delete_row").click(function (evt) {
                _this.deleteRow($(this).parents("tr")[0].id);
            });
        }

        for (var idx = 0; idx < this.templateBoundNodes.length; idx++) {
            var control = this.templateBoundNodes[idx];

            var domNode = clonedNode.find("#" + control.id);
            if (domNode.length > 0) {
                domNode = domNode[0];
                var newItemId = domNode.id + rowId;
                domNode.id = newItemId;
                var val = this.resolveBindingValue(dataItem, control.bindSetting);
                switch (control.type) {
                    case "picture":
                        $(domNode).attr('src', val);
                        break;
                    case "label":
                        val = control._formatValue(val);
                        $(domNode).html(val);

                        if (control.options.colorMapInfo) {
                            //get field value
                            var cMapVal = _this.resolveBindingValue(dataItem, { source: control.bindSetting.source, path: control.options.colorMapInfo.field });
                            var color = control._mapColor(cMapVal);
                            if (color) {
                                $(domNode).css('color', color);
                            }
                        }

                        break;
                    case "textbox":
                        var bHook = (function (binding) {
                            return function (value) {
                                _this._updateBindObj(this, value, binding, currRowId);
                                return false;
                            }
                        })(control.options.binding);

                        var txtControl = new Td.Controls.TextBox(
						        newItemId,
						        {
						            binding: control.options.binding,
						            bindHook: $.proxy(bHook, dataItem),
						            change: control.options.change,
						            create: control.options.create,
                                    endedit: control.options.endedit
						        }
					        );
                        $(domNode).val(val);
                        break;
                    case "flipswitch":
                        var bHook = (function (binding) {
                            return function (value) {
                                _this._updateBindObj(this, value, binding, currRowId);
                                return false;
                            }
                        })(control.options.binding);

                        var fCtrl = new Td.Controls.FlipSwitch(
						        newItemId,
						        {
						            binding: control.options.binding,
						            bindHook: function () { },
						            change: control.options.change,
						            create: control.options.create
						        }
					        );
                        fCtrl.updateValue(val);
                        //don't set hook until after we set the value above, otherwise our hook get's called
                        //setting this record as updated
                        fCtrl.options.bindHook = $.proxy(bHook, dataItem);
                        break;
                    case "combobox":
                        var bHook = (function (binding) {
                            return function (value) {
                                _this._updateBindObj(this, value, binding, currRowId);
                                return false;
                            }
                        })(control.options.binding);

                        var fCtrl = new Td.Controls.ComboBox(
						        newItemId,
						        {
						            binding: control.options.binding,
						            bindHook: $.proxy(bHook, dataItem),
						            change: control.options.change,
						            create: control.options.create
						        }
					        );
                        fCtrl.updateValue(val);
                        break;
                    case "link":
                        if ($(domNode).text() == "") {
                            $(domNode).text(val);
                        }
                        val = control._convertToHref(val);
                        $(domNode).attr('href', val);
                        break;
                }
            }
        }
    },

    addRow: function () {
        var dataItem = {};

        if (typeof (this.options.addOperation) != "undefined") {
            //get param bind from op
            var op = Td.Data.Operation.get(this.options.addOperation);

            var bindName;
            for (var pName in op.paramBinds) {
                bindName = op.paramBinds[pName];
                break;
            }

            if (bindName) {
                var bind = Td.Data.Binding.get(bindName);
                //inits a default object
                bind.setValue("");
                dataItem = bind.getValue();
            }

            this._updateOpParamBind(this.options.addOperation, dataItem);
        }

        if (this.options.rowadd) {
            this.options.rowadd();
        }

        this._renderRow(dataItem, true);
        this._addedRecords[this._maxRowId] = dataItem;
        //add to the underlying bind array?
    },

    deleteRow: function (rowId) {

        if (this.options.rowdelete) {
            this.options.rowdelete();
        }

        var rowIdNum = parseInt(rowId.substring(rowId.indexOf('_row_') + '_row_'.length));
        var rowElem = $('#' + rowId);
        var dataItem = rowElem.data('dataItem');

        if (this._addedRecords[rowIdNum]) {
            delete this._addedRecords[rowIdNum];
        }
        else if (this._updatedRecords[rowIdNum]) {
            delete this._updatedRecords[rowIdNum];
            this._deletedRecords[rowIdNum] = dataItem;
        }
        else {
            this._deletedRecords[rowIdNum] = dataItem;
        }

        rowElem.remove();
    },

    saveChanges: function () {
        var _this = this;

        //save updates
        this._pushRecords(
            this.options.updateOperation,
            this._updatedRecords,
            false,
            function () {
                _this._updatedRecords = {};
                //save adds
                _this._pushRecords(
                    _this.options.addOperation,
                    _this._addedRecords,
                    false,
                    function () {
                        _this._addedRecords = {};
                        //save deletes
                        _this._pushRecords(
                            _this.options.deleteOperation,
                            _this._deletedRecords,
                            true,
                            function () {
                                _this._deletedRecords = {};
                                if (_this.options.changessaved) {
                                    _this.options.changessaved();
                                }
                            });
                    });
            });
    },

    _pushRecords: function (opName, recordMap, isDelete, completeCallback) {

        var op;
        if (typeof (opName) != "undefined") {
            op = Td.Data.Operation.get(opName);
        }

        if (!op) {
            completeCallback();
            return;
        }
        
        var records = [];

        for (var rowId in recordMap) {
            records.push({ recordId: rowId, recordValue: recordMap[rowId] });
        }

        if (records.length > 0) {
            this._pushNextRecord(op, records, isDelete, completeCallback);
        }
        else {
            completeCallback();
        }
    },

    _pushNextRecord: function(op, records, isDelete, completeCallback) {
        var _this = this;
        var nextRecord = records.shift();
        if (nextRecord) {
            var bind = this._updateOpParamBind(op.name, nextRecord.recordValue, isDelete);

            $(bind).one(
                    'validchanged',
                    function (evt, isValid, invalidPaths) {

                        for (var idx = 0; idx < _this.templateBoundNodes.length; idx++) {
                            var ctrl = _this.templateBoundNodes[idx];
                            if (ctrl.type == "textbox") {
                                var ctrlRowId = ctrl.id + _this.id + "_row_" + nextRecord.recordId;
                                var ctrl = Td.Controls.get(ctrlRowId);
                                ctrl.handleValidateChanged(isValid, invalidPaths);
                            }
                        }
                    });

            op.invoke(
                {
                    complete: function () {
                        _this._pushNextRecord(op, records, isDelete, completeCallback);
                    },
                    noValidate: isDelete
                });
        }
        else {
            completeCallback();
        }
    },

    _updateBindObj: function (bindObj, newValue, bindSetting, rowId) {

        var binding = Td.Data.Binding.get(bindSetting.source);
        var value = newValue;

        var memInfo = binding;
        if (bindSetting.path) {
            memInfo = binding.memberMap[bindSetting.path];
        }

        if ((memInfo.type == "Date/Time"
                || memInfo.type == "Number")
                && (value == null || typeof (value.IsNull) == "undefined")) {
            var isNull = value == null || typeof (value) == "undefined" || value === "";
            if (memInfo.type == "Date/Time") {
                if (typeof (value) == "string") {
                    if (value.indexOf('-') == -1
                            && value.indexOf(':') != -1) {
                        //just time
                        var timeElems = value.split(':');
                        value = new Date(0, 0, 0, parseInt(timeElems[0]), parseInt(timeElems[1]), 0, 0);
                    }
                    else {
                        //Dates with dash YYYY-mm-dd get parsed
                        //as UTC, which we don't want (causes day value to be incorrect)
                        value = value.replace(/-/g, "/");

                        //Split the date into numeric parts, some browsers (iOS) date pickers
                        //pass values that don't work with the string ctor of Date.
                        var dt = value.split(/[^0-9]/);
                        if (dt.length < 3) {
                            //empty date
                            value = new Date(0);
                        }
                        else if (dt.length == 3) {
                            //just a date
                            value = new Date(dt[0], dt[1] - 1, dt[2]);
                        }
                        else {
                            value = new Date(dt[0], dt[1] - 1, dt[2], dt[3], dt[4]);
                        }
                    }
                }
                else if (value == null || typeof (value) == "undefined") {
                    value = new Date(0);
                }
            }
            else if (memInfo.type == "Number") {
                if (typeof (value) == "string") {
                    if (value == "") {
                        value = 0;
                        isNull = true;
                    }
                    else {
                        value = Td.Localization.parseNumber(value);
                        isNull = isNaN(value);
                    }
                }
                else if (value == null || typeof (value) == "undefined") {
                    value = 0;
                }
            }
            value = { Value: value, IsNull: isNull };

            //make sure our value object has this property defined, used elsewhere to detect
            //the object is a SAL date
            if (memInfo.type == "Date/Time") {
                value.IsYearZero = false;
            }
        }


        bindObj[bindSetting.path] = value;
        if (!this._addedRecords[rowId]) {
            this._updatedRecords[rowId] = bindObj;
        }

        if (this.options.rowupdate) {
            this.options.rowupdate();
        }
    },

    _updateOpParamBind: function(opName, bindVal, isDelete) {
        var op;
        if (typeof (opName) != "undefined") {
            op = Td.Data.Operation.get(opName);
        }

        if (!op) {
            return;
        }

        //get first param bind
        var bindName;
        for (var pName in op.paramBinds) {
            bindName = op.paramBinds[pName];
            break;
        }

        if (bindName) {
            var bPath;
            var dIdx = bindName.indexOf('.');
            if (dIdx != -1) {
                bPath = bindName.substring(dIdx + 1, bindName.length);
                bindName = bindName.substring(0, dIdx);
            }

            if (isDelete && bPath) {
                //special case delte data ops, which take an ID
                bindVal = bindVal[bPath];
            }

            var bind = Td.Data.Binding.get(bindName);
            bind.setValue(bindVal, bPath);
            return bind;
        }
    },

    setCaption: function (value) {
        for (var idx = 0; idx < this.options.columns.length; idx++) {
            var col = this.options.columns[idx];
            if (col.caption) {
                var colCaption = Td.Localization.resolve(col.caption);
                $("#" + Td.Controls._currPage.id + " #" + col.name).text(colCaption);
            }
        }
    }
});

/**
 * ListView
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.ListView
 * @classdesc Client side listview control.
 * @extends Td.Controls.Control
 */
Td.Controls.ListView = Td.Controls.Control.extend({
    type: "listview",

    init: function (id, options) {
        this._super(id, options);
        var dElem = $(this.getJQMId());
        var listBindingAttr = options.listbinding;
        var _this = this;

        if (typeof (listBindingAttr) != "undefined") {
            this.listBinding = new Td.Data.Binding.get(listBindingAttr.source);
            $(this.listBinding).on(
					'changed',
					function (evt, value) { _this.updateItemsFromBind(value) }
					);
        }

        //find item template, if any
        var tmplNode = $("#" + Td.Controls._currPage.id + " #" + id + "_listitem_template");

        if (tmplNode.length > 0) {
            this.listItemTemplate = tmplNode;
            this.templateBoundNodes = [];

            //find all data bound items in the template
            var _this = this;
            var childNodes = tmplNode.find('*');
            $.each(childNodes, function (idx, cNode) {
                var idAttr = $(cNode).attr('id');
                if (typeof (idAttr) != "undefined") {
                    var ctrl = Td.Controls.get(idAttr);
                    if (ctrl && (ctrl.binding || ctrl.options.visbinding)) {
                        _this.templateBoundNodes.push(ctrl);
                    }
                }
            });
        }

        if (options.filter) {
            dElem.listview(
                "option",
                "filterCallback",
                function (text, searchVal, item) { return _this.filterItem(searchVal, item) }
                );
        }

        if (options.divider) {
            dElem.listview(
                "option",
                "autodividersSelector",
                function (item) { return _this.getDivideValue(item) }
                );
        }

        if (this.listBinding
                && this.listBinding.hasNonDefaultInitValue) {
            this.updateItemsFromBind(this.listBinding.getValue(listBindingAttr.path));
        }
    },

    filterItem: function (searchVal, item) {
        var filterItem = $(item).find('#' + this.options.filter);
        if (filterItem.length) {
            var text = $(filterItem[0]).text();
            return text.toLowerCase().indexOf(searchVal) == -1;
        }
        return false;
    },

    getDivideValue: function (item) {
        var divideItem = $(item).find('#' + this.options.divider);
        if (divideItem.length) {
            var text = $(divideItem[0]).text();
            return text[0];
        }
        return $(item).text()[0];
    },

    updateItemsFromBind: function (value) {
        var dElem = $(this.getJQMId());
        var _this = this;
        dElem.empty();
        if (value && $.isArray(value)) {
            if (typeof (this.listItemTemplate) == "undefined") {
                //if there's no item template, then we just create
                //list items from values in the array
                $.each(value, function (idx, item) {
                    if (item) {
                        var liNode = $("<li></li>");

                        if (_this.options.click) {
                            var aNode = $("<a></a>").attr("href", "#");
                            aNode.click({ datacontext: item }, function (evt) {
                                _this.handleClick(evt);
                            });
                            aNode.html(item);
                            liNode.append(aNode);
                        }
                        else {
                            liNode.html(item);
                        }

                        dElem.append(liNode);
                    }

                });
            }
            else {
                $.each(value, function (idx, item) {
                    if (item) {
                        //clone the template node, remove display:none
                        var clonedNode = _this.listItemTemplate.clone();
                        clonedNode.attr("id", clonedNode.attr("id") + "_" + idx);
                        clonedNode.css('display', '');

                        if (_this.templateBoundNodes.length == 0) {
                            //find first div (label) and put value there
                            var div = clonedNode.find("div");
                            if (div.length > 0) {
                                $(div[0]).html(item);
                            }
                        }
                        else {
                            //find all data bound children, and resolve their value
                            $.each(_this.templateBoundNodes, function (nIdx, control) {

                                var domNode = clonedNode.find("#" + control.id);
                                if (domNode.length > 0) {
                                    domNode = domNode[0];

                                    if (control.bindSetting) {
                                        var val = _this.resolveBindingValue(item, control.bindSetting);
                                        switch (control.type) {
                                            case "picture":
                                                $(domNode).attr('src', val);
                                                break;
                                            case "label":
                                                val = control._formatValue(val);
                                                $(domNode).html(val);

                                                if (control.options.colorMapInfo) {
                                                    //get field value
                                                    var cMapVal = _this.resolveBindingValue(item, { source: control.bindSetting.source, path: control.options.colorMapInfo.field });
                                                    var color = control._mapColor(cMapVal);
                                                    if (color) {
                                                        $(domNode).css('color', color);
                                                    }
                                                }
                                                break;
                                            case "link":
                                                if ($(domNode).text() == "") {
                                                    $(domNode).text(val);
                                                }
                                                val = control._convertToHref(val);
                                                $(domNode).attr('href', val);
                                                break;
                                        }
                                    }

                                    if (control.options.visbinding) {
                                        var visBind = Td.Data.Binding.get(control.options.visbinding.source);
                                        var visVal = _this.resolveBoolValue(visBind, control.options.visbinding, item);

                                        if (visVal) {
                                            $(domNode).show();
                                        }
                                        else {
                                            $(domNode).hide();
                                        }
                                    }
                                }
                            });
                        }

                        //create list item
                        var liNode = $("<li></li>");

                        if (_this.options.click) {
                            var aNode = $("<a></a>").attr("href", "#");
                            aNode.click({ datacontext: item }, function (evt) {
                                _this.handleClick(evt);
                            });
                            aNode.append(clonedNode);
                            liNode.append(aNode);
                        }
                        else {
                            liNode.append(clonedNode);
                        }

                        dElem.append(liNode);
                    }

                });
            }
        }

        dElem.listview("refresh");
    },

    handleClick: function (evt) {
        if ($(this.getJQMId()).listview("option", "disabled")) {
            return;
        }
        if (this.binding) {
            this.binding.setValue(evt.data.datacontext);
        }
        this.options.click();
    },

    updateVisibility: function (value) {
        var node = $(this.getJQMId());
        var filter = node.data('filter');
        if (value) {
            node.show();
            node.parents("#" + this.id + "_container").show();

            if (filter) {
                node.prev().show();
            }
        }
        else {
            node.hide();
            node.parents("#" + this.id + "_container").hide();

            if (filter) {
                node.prev().hide();
            }
        }
    },

    updateEnabled: function (value) {
        if (value) {
            $(this.getJQMId()).listview("option", "disabled", false);
        }
        else {
            $(this.getJQMId()).listview("option", "disabled", true);
        }
    },

    handleValidateChanged: function () {
        //do nothing
    }
});

/**
 * Label
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Label
 * @classdesc Client side label control.
 * @extends Td.Controls.Control
 */
Td.Controls.Label = Td.Controls.Control.extend({
    type: "label",

    init: function (id, options) {
        this._super(id, options);

        if (this.options.colorMapInfo
                && this.binding) {
            var _this = this;

            //store user defined default color if mapping exist
            this._defaultColor = $(this.getJQMId()).css('color');

            $(this.binding).on(
			    'changed',
			    function (evt, value, path) {
			        if ((!path || path == this.options.colorMapInfo.field) && !$.isArray(value)) {
			            var color = _this._mapColor(_this.resolveBindingValue(value, { source: _this.bindSetting.source, path: path }));
			            if (color) {
			                $(_this.getJQMId()).css('color', color);
			            }
			        }
			    });
        }
    },

    updateValue: function (value) {
        value = this._formatValue(value);
        $(this.getJQMId()).html(value);
    },

    setCaption: function (value) {
        $(this.getJQMId()).html(value);
    },

    getCaption: function () {
        return $(this.getJQMId()).html();
    },

    _formatValue: function (value) {
        if (typeof (this.options.format) != "undefined") {
            if (this.options.format == "Number") {
                if (typeof (value) == "string") {
                    value = parseFloat(value);
                }
                if (typeof (value) == "number") {
                    value = value.toLocaleString();
                }
            }
            else {
                value = $.format.date(value, this.options.format);
            }
        }
        return value;
    },

    _mapColor: function (value) {
        if (this.options.colorMapInfo.colorMappings) {
            for (var idx = 0; idx < this.options.colorMapInfo.colorMappings.length; idx++) {
                var cMap = this.options.colorMapInfo.colorMappings[idx];
                var expr = Td.Util._formatString(cMap.expression, [value]);
                var result = false;
                try {
                    result = eval(expr);
                }
                catch(exc){}
                if (result) {
                    return cMap.color;
                }
            }
            return this._defaultColor;
        }
        return false;
    }
});

/**
 * Navigator
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Navigator
 * @classdesc Client side Navigator control.
 * @extends Td.Controls.Control
 */
Td.Controls.Navigator = Td.Controls.Control.extend({
    type: "navigator"
});

/**
 * Link
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Link
 * @classdesc Client side link control.
 * @extends Td.Controls.Control
 */
Td.Controls.Link = Td.Controls.Control.extend({
    type: "link",

    init: function (id, options) {
        this.linkType = options.linktype;
        this._super(id, options);

        if (this.linkType == "Map") {
            this.updateValue($(this.getJQMId()).attr('href'), false);
        }
    },

    updateValue: function (value, encode) {
        var node = $(this.getJQMId());
        //if no title is set, use same value as bind
        if (node.text() == "") {
            node.text(value);
        }

        value = this._convertToHref(value, encode);
        node.attr('href', value);
    },

    setCaption: function (value) {
        $(this.getJQMId()).text(value);
    },

    getCaption: function () {
        return $(this.getJQMId()).text();
    },

    _convertToHref: function (value, encode) {
        switch (this.linkType) {
            case "Email":
                value = "mailto:" + value;
                break;
            case "Phone":
                value = "tel:" + value;
                break;
            case "Sms":
                value = "sms:" + value;
                break;
            case "Javascript":
                value = "javascript:" + value;
                break;
            case "Map":
                var provider = "http://maps.google.com/maps";
                if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                    //use native maps app on iOS devices
                    provider = "http://maps.apple.com/";
                }
                if (encode) {
                    value = encodeURIComponent(value);
                }
                value = provider + "?q=" + value;
                break;
        }
        return value;
    }
});

/**
 * CheckBox
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.CheckBox
 * @classdesc Client side checkbox control.
 * @extends Td.Controls.Control
 */
Td.Controls.CheckBox = Td.Controls.Control.extend({
    type: "checkbox",

    init: function (id, options) {
        this._super(id, options);
        if (typeof (this.binding) != "undefined") {

            if (this.bindSetting.direction == "getset"
					|| this.bindSetting.direction == "set") {
                var dElem = $(this.getJQMId());
                var _this = this;
                dElem.change(function () {
                    _this.updateBindingSource(dElem.prop("checked") == true);
                });
            }
        }

        if (options.change) {
            $(this.getJQMId()).change(function () {
                options.change();
            });
        }

        if (options.click) {
            $(this.getJQMId()).click(function () {
                options.click();
            });
        }
    },

    updateValue: function (value) {
        $(this.getJQMId()).prop("checked", value).checkboxradio("refresh");
    },

    setCaption: function (value) {
        var labels = $("label[for='" + this.id + "']");
        if (labels.length > 0) {
            $(labels[0]).text(value);
        }
    },

    updateEnabled: function (value) {
        if (value) {
            $(this.getJQMId()).checkboxradio("enable");
        }
        else {
            $(this.getJQMId()).checkboxradio("disable");
        }
    },

    updateVisibility: function (value) {
        this._super(value);
        var node = $(this.getJQMId());
        var pGrp = node.parents('div[data-role="controlgroup"]');
        if (pGrp.length > 0) {
            //we're inside a control group, also hide our parent div and force a refresh
            //of the group to get correct borders
            var pDiv = node.parents(".ui-checkbox");
            if (value) {
                pDiv.show();
            }
            else {
                pDiv.hide();
            }
            setTimeout(
                    function () { pGrp.controlgroup("refresh"); },
                    0);

        }
    }
});

/**
 * Radio
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Radio
 * @classdesc Client side radio button control.
 * @extends Td.Controls.Control
 */
Td.Controls.Radio = Td.Controls.Control.extend({
    type: "radio",

    init: function (id, options) {
        this._super(id, options);
        if (typeof (this.binding) != "undefined") {

            if (this.bindSetting.direction == "getset"
					|| this.bindSetting.direction == "set") {
                var dElem = $(this.getJQMId());
                var _this = this;
                dElem.change(function () {
                    var checked = dElem.prop("checked") == true;

                    if (typeof (options.checkValue) != "undefined") {
                        if (checked) {
                            _this.updateBindingSource(options.checkValue);
                        }
                    }
                    else {
                        _this.updateBindingSource(checked);
                        if (checked) {
                            //Changed event won't be raised for other radio buttons in the group that are now deselected.
                            //So manually loop through buttons with the same name and update their bind to false.
                            var btnsInGroup = $("input[type=radio][name=" + dElem.prop("name") + "]");
                            for (var idx = 0; idx < btnsInGroup.length; idx++) {
                                var btn = btnsInGroup[idx];
                                if (btn.id != _this.id) {
                                    var btnCtrl = Td.Controls.get(btn.id);
                                    btnCtrl.updateBindingSource(false);
                                }
                            }
                        }
                    }
                });
            }
        }

        if (options.change) {
            $(this.getJQMId()).change(function () {
                options.change();
            });
        }

        if (options.click) {
            $(this.getJQMId()).click(function () {
                options.click();
            });
        }
    },

    updateValue: function (value) {
        if (typeof (this.options.checkValue) != "undefined") {
            value = value == this.options.checkValue;
        }
        $(this.getJQMId()).prop("checked", value).checkboxradio("refresh");
    },

    setCaption: function (value) {
        var labels = $("label[for='" + this.id + "']");
        if (labels.length > 0) {
            $(labels[0]).text(value);
        }
    },

    updateEnabled: function (value) {
        if (value) {
            $(this.getJQMId()).checkboxradio("enable");
        }
        else {
            $(this.getJQMId()).checkboxradio("disable");
        }
    },

    updateVisibility: function (value) {
        this._super(value);
        var node = $(this.getJQMId());
        var pGrp = node.parents('fieldset[data-role="controlgroup"]');
        if (pGrp.length > 0) {
            //we're inside a control group, also hide our parent div and force a refresh
            //of the group to get correct borders
            var pDiv = node.parents(".ui-radio");
            if (value) {
                pDiv.show();
            }
            else {
                pDiv.hide();
            }
            setTimeout(
                    function () { pGrp.controlgroup("refresh"); },
                    0);
            
        }
    }
});

/**
 * FlipSwitch
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.FlipSwitch
 * @classdesc Client side toggle control.
 * @extends Td.Controls.Control
 */
Td.Controls.FlipSwitch = Td.Controls.Control.extend({
    type: "flipswitch",

    init: function (id, options) {
        this._super(id, options);
        if (typeof (this.binding) != "undefined") {

            if (this.bindSetting.direction == "getset"
					|| this.bindSetting.direction == "set") {
                var dElem = $(this.getJQMId());
                var _this = this;
                dElem.change(function () {
                    _this.updateBindingSource(dElem.val() == "on");
                });
            }
        }

        if (options.change) {
            $(this.getJQMId()).change(function () {
                options.change();
            });
        }

        if (options.click) {
            $(this.getJQMId()).click(function () {
                options.click();
            });
        }

		if (typeof(options.caption) == "undefined") {
            var _this = this;
			$(Td.Localization).on(
					'localechanged',
					function (evt) { _this.lookupCaption() }
					);
		}
    },

    updateValue: function (value) {
        var tVal = value == true ? "on" : "off";
        $(this.getJQMId()).val(tVal, true).flipswitch("refresh");
    },

    updateEnabled: function (value) {
        if (value) {
            $(this.getJQMId()).flipswitch("enable");
        }
        else {
            $(this.getJQMId()).flipswitch("disable");
        }
    },

    setCaption: function (value) {
        this._super(value);
        $(this.getJQMId()).flipswitch("option", "onText", Td.Localization.resolve(this.options.ontext));
        $(this.getJQMId()).flipswitch("option", "offText", Td.Localization.resolve(this.options.offtext));
    }
});

/**
 * Slider
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Slider
 * @classdesc Client side slider control.
 * @extends Td.Controls.Control
 */
Td.Controls.Slider = Td.Controls.Control.extend({
    type: "slider",

    init: function (id, options) {
        this._super(id, options);
        var _this = this;
        //handle changed event on low val binding
        if (typeof (this.options.lowbinding) != "undefined" && this.options.isRange) {
            this.lowbindSetting = $.extend({ direction: "getset" }, this.options.lowbinding);
            this.lowbinding = Td.Data.Binding.get(this.lowbindSetting.source);

            if (this.lowbindSetting.direction == "getset"
                || this.lowbindSetting.direction == "get") {

                if (this.lowbinding.hasNonDefaultInitValue) {
                    _this.updateLowValue(_this.resolveBindingValue(this.lowbinding.getValue(), this.lowbindSetting));
                }

                $(this.lowbinding).on(
                    'changed',
                    function (evt, value, path) { _this.handleLowValueBindChanged(value, path) }
                    );
            }

            $(this.lowbinding).on(
                    'validchanged',
                    function (evt, isValid, invalidPaths) { _this.handleValidateChanged(isValid, invalidPaths) }
                    );
        }

        if (this.options.isRange) {
            var lowElem = $(this.getJQMId() + "_sliderinput_a");
            var highElem = $(this.getJQMId() + "_sliderinput_b");

            if (typeof (this.binding) != "undefined") {
                if (this.bindSetting.direction == "getset"
                        || this.bindSetting.direction == "set") {
                    highElem.change(function () {
                        _this.updateBindingSource(highElem.val());
                    });
                }
            }

            if (typeof (this.lowbinding) != "undefined") {
                if (this.lowbindSetting.direction == "getset"
                        || this.lowbindSetting.direction == "set") {
                    lowElem.change(function () {
                        _this.updateLowBindingSource(lowElem.val());
                    });
                }
            }

            if (options.change) {
                lowElem.change(function () {
                    options.change();
                });
                highElem.change(function () {
                    options.change();
                });
            }
        }
        else {
            if (typeof (this.binding) != "undefined") {
                if (this.bindSetting.direction == "getset"
                        || this.bindSetting.direction == "set") {
                    var dElem = $(this.getJQMId());
                    dElem.change(function () {
                        _this.updateBindingSource(dElem.val());
                    });
                }
            }

            if (options.change) {
                $(this.getJQMId()).change(function () {
                    options.change();
                });
            }
        }
    },

    updateValue: function (value) {
        if (this.options.isRange) {
            $(this.getJQMId() + "_sliderinput_b").val(value).slider("refresh");
        }
        else {
            $(this.getJQMId()).val(value).slider("refresh");
        }
    },

    updateLowValue: function (value) {
        $(this.getJQMId() + "_sliderinput_a").val(value).slider("refresh");
    },

    handleLowValueBindChanged: function (value, path) {
        if (!this._updatingBindSource) {
            if (!path || path == this.bindSetting.path) {
                this.updateLowValue(this.resolveBindingValue(value, this.lowbindSetting));
            }
        }
    },

    updateLowBindingSource: function (value) {
        try {
            this._updatingBindSource = true;
            this.lowbinding.setValue(value, this.lowbindSetting.path);
        }
        finally {
            this._updatingBindSource = false;
        }
    },

    setCaption: function (value) {
        var labels = $("label[for='" + this.id + "']");
        if (labels.length > 0) {
            $(labels[0]).text(value);
        }
    },

    updateEnabled: function (value) {
        
        if (value) {
            if (this.options.isRange) {
                $(this.getJQMId() + "_sliderinput_a").slider("enable");
                $(this.getJQMId() + "_sliderinput_b").slider("enable");
            }
            else {
                $(this.getJQMId()).slider("enable");
            }
        }
        else {
            if (this.options.isRange) {
                $(this.getJQMId() + "_sliderinput_a").slider("disable");
                $(this.getJQMId() + "_sliderinput_b").slider("disable");
            }
            else {
                $(this.getJQMId()).slider("disable");
            }
        }
    }
});

/**
 * ComboBox
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.ComboBox
 * @classdesc Client side combobox control.
 * @extends Td.Controls.Control
 */
Td.Controls.ComboBox = Td.Controls.Control.extend({
    type: "combobox",

    init: function (id, options) {
        this._super(id, options);
        var dElem = $(this.getJQMId());
        var listBindingAttr = options.listbinding;
        this.displayMemberPath = options.displayMemberPath;
        var _this = this;

        if (typeof (this.binding) != "undefined") {

            if (this.bindSetting.direction == "getset"
					|| this.bindSetting.direction == "set") {
                dElem.change(function () {
                    var value = dElem.val();

                    if (_this.options.emptyChoice
                            && _this.options.emptyChoice == value) {
                        _this.updateBindingSource("");
                        return;
                    }

                    if (typeof (_this.displayMemberPath != "undefined")) {
                        var selected = dElem.find("option:selected");
                        if (selected.length == 1) {
                            var itemData = $(selected[0]).data("item");
                            if (typeof (itemData) != "undefined") {
                                value = itemData;
                            }
                        }
                    }

                    _this.updateBindingSource(value);
                });
            }
        }

        if (this.binding) {
            //if the combo has list initialization values, set bind to first option
            var opNodes = dElem.find("option");
            if (opNodes.length != 0) {
                var oVal = opNodes[0].value;
                this.binding.setValue(oVal, this.bindSetting.path);
            }
        }

        if (typeof (listBindingAttr) != "undefined") {
            this.listBinding = new Td.Data.Binding.get(listBindingAttr.source);
            $(this.listBinding).on(
					'changed',
					function (evt, value, path) {
					    if (!path || path == _this.listBinding.path) {
					        _this.updateItemsFromBind(_this.listBinding.getValue(listBindingAttr.path))
					    }
					});
        }

        if (options) {
            if (options.change) {
                dElem.change(function () {
                    options.change();
                });
            }
        }

        if (this.listBinding
                && this.listBinding.hasNonDefaultInitValue) {
            this.updateItemsFromBind(this.listBinding.getValue(listBindingAttr.path));
        }

        if (options && options.emptyChoice) {
            this.emptyChoiceMap = options.emptyChoice;

            $(Td.Localization).on(
                'localechanged',
                function (evt) {
                    _this.updateItemsFromBind(_this.listBinding.getValue(listBindingAttr.path));
                });
        }
    },

    updateItemsFromBind: function (value) {
        var dElem = $(this.getJQMId());
        var _this = this;
        var hasDispPath = typeof (this.displayMemberPath) != "undefined";
        var selectedItem = false;

        dElem.empty();

        if (this.emptyChoiceMap) {
            var emptyChoice = Td.Localization.resolve(this.emptyChoiceMap);
            var emptyOpt = $("<option></option>")
                    .attr("value", emptyChoice)
                    .text(emptyChoice);
            dElem.append(emptyOpt);
        }

        if (value && $.isArray(value)) {
            $.each(value, function (idx, item) {
                if (item != null) {

                    var text = item;
                    if (typeof (item) == "object") {
                        if (hasDispPath) {
                            text = _this.resolveBindingValue(item, { "source": _this.options.listbinding.source, "path": _this.displayMemberPath });
                        }
                    }

                    var opt = $("<option></option>")
                        .attr("value", text)
                        .text(text);
                    if (hasDispPath) {
                        opt.data("item", item);
                    }
                    if (item == _this._selectecValue) {
                        selectedItem = true;
                        opt.attr("selected", "selected");
                    }
                    dElem.append(opt);
                }
            });
        }

        $(this.getJQMId()).selectmenu("refresh");

        if (!selectedItem
                && value.length > 0
                && this.binding
                && !this.emptyChoiceMap) {
            _this.updateBindingSource(value[0]);
        }
    },

    handleValueBindChanged: function (value, path) {
        //special case for combo, also check if path is same as our displayMemberPath setting
        if (!this._updatingBindSource) {
            if (!path || path == this.bindSetting.path || path == this.displayMemberPath) {
                this.updateValue(this.resolveBindingValue(value, this.bindSetting));
            }
        }
    },

    updateValue: function (value) {
        if ($(this.getJQMId()).children().length == 0) {
            //using val() won't work, store away so we can select
            //when we populate later
            this._selectecValue = value;
        }
        else {
            this._selectecValue = null;

            if (typeof (value) == "object") {
                if (typeof (this.displayMemberPath) != "undefined") {
                    value = this.resolveBindingValue(value, { "source": this.options.listbinding.source, "path": this.displayMemberPath });
                }
            }

            $(this.getJQMId()).val(value);
            $(this.getJQMId()).selectmenu("refresh");
        }
    },

    updateEnabled: function (value) {
        if (value) {
            $(this.getJQMId()).selectmenu("enable");
        }
        else {
            $(this.getJQMId()).selectmenu("disable");
        }
    }
});

/**
 * Expander
 * @param {string} id - The unique ID of the control.
 * @param {object} options - Options for this control
 * @class Td.Controls.Expander
 * @classdesc Client side Expander control.
 * @extends Td.Controls.Control
 */
Td.Controls.Expander = Td.Controls.Control.extend({
    type: "expander",

    init: function (id, options) {
        this._super(id, options);
        var _this = this;
        $(this.getJQMId()).on("collapsibleexpand", function (event, ui) { _this.onExpand(); });
        $(this.getJQMId()).on("collapsiblecollapse", function (event, ui) { _this.onCollapse(); });
    },

    setCaption: function (value) {
        var headerNode = $(this.getJQMId()).find("h4")[0];
        var txtSpan = $(headerNode).find(".ui-btn");
        $(txtSpan[0]).text(value);
    },

    getCaption: function () {
        var headerNode = $(this.getJQMId()).find("h4")[0];
        var txtSpan = $(headerNode).find(".ui-btn");
        return $(txtSpan[0]).text();
    },

    onExpand: function () {
        //refresh any child charts
        var charts = $(this.getJQMId()).find("[data-role='chart']");
        for (var idx = 0; idx < charts.length; idx++) {
            var chartCtrl = Td.Controls.get(charts[idx].id);
            if (chartCtrl) {
                chartCtrl.refresh();
            }
        }

        if (this.options.expand) {
            this.options.expand();
        }
    },

    onCollapse: function () {
        if (this.options.collapse) {
            this.options.collapse();
        }
    }
});

/**
 * Static utility functions
 * @namespace
 * @static
 */
Td.Util = {

    /** 
     * @member {bool} debug - Set to true to enable debug console output 
     * @memberof Td.Util
     */
    debug: false,

    _initDebug: function () {
        var qryParams = Td.Util.getQueryParams();
        if (qryParams.length > 0
                && qryParams["_debug"] == "true") {
            Td.Util.debug = true;
            Td.Util.log("Debug on");
        }
    },

    //keep track of open ajax requests
    _initAjax: function () {
        Td.Util._xhrReqs = [];

        $.ajaxSetup({
            beforeSend: function (jqXHR) {
                Td.Util._xhrReqs.push(jqXHR);
            },
            complete: function (jqXHR) {
                var index = Td.Util._xhrReqs.indexOf(jqXHR);
                if (index > -1) {
                    Td.Util._xhrReqs.splice(index, 1);
                }
            }
        });
    },

    //call abort on all outstanding ajax requests
    _abortAllAjaxReqs: function () {
        if (Td.Util.debug
                && Td.Util._xhrReqs.length > 0) {
            Td.Util.log("Aborting " + Td.Util._xhrReqs.length + " outstanding requests");
        }

        $(Td.Util._xhrReqs).each(function (idx, jqXHR) {
            jqXHR.abort();
        });
        Td.Util._xhrReqs = [];
    },

    /** 
     * Get map of query parameters
     * @function
     * @memberof Td.Util
     * @return {Object} - Map with key/value pairs for all query params
     */
    getQueryParams: function () {
        var vars = [], hash;
        var q = document.URL.split('?')[1];
        if (q != undefined) {
            q = q.split('&');
            for (var i = 0; i < q.length; i++) {
                hash = q[i].split('=');
                vars.push(hash[1]);
				var qVal = decodeURIComponent(hash[1]);
				qVal = qVal.replace(/%27/g,"'");
				vars[hash[0]] = qVal;
            }
        }
        return vars;
    },

    /** 
     * Navigate to a page
     * @function
     * @memberof Td.Util
     * @param {string} pageName - Name of page to navigate to
     * @param {array<string>} params - Array of parameters, can be a literal value or name of a bind
     */
    navToPage: function (pageName, params) {

        //abort any outstanding requests
        Td.Util._abortAllAjaxReqs();

        if (pageName == "<return_page>") {
            var returnBind = Td.Data.Binding.get("[return_page]");
            if (returnBind) {
                pageName = returnBind.getValue();
            }
        }

        if (Td.Util.isCordovaApp()) {
            //on Cordova apps, we need to use the pages filename directly
            pageName = Td.Config.mapPageToDisplay(pageName);
        }

        var url = pageName;
        if (typeof (params) != "undefined") {
            url += "?";
            var bindsValid = true;
            for (var idx = 0; idx < params.length; idx++) {
                var pInfo = params[idx];
                url += pInfo.name + "=";
                var value;
                if (typeof (pInfo.value) != "undefined") {
                    value = pInfo.value;
                }
                else {
                    var bindElems = pInfo.binding.split('.');
                    var bindSource = bindElems[0];
                    var path = null;
                    if (bindElems.length > 1) {
                        bindElems.shift();
                        path = bindElems.join('.');
                    }
                    var bind = Td.Data.Binding.get(bindSource);

                    if (!bind.isValid()) {
                        bindsValid = false;
                        continue;
                    }

                    value = bind.getValue(path);
                    var type = Td.Data.Binding.get(bindSource).getType(path);
                    if (type == "Number" || type == "Date/Time") {
                        value = value.IsNull ? '' : value.Value;
                    }
                    else if (type == "Functional Class") {
                        value = JSON.stringify(value);
                    }
                }
				if (typeof(value) == "string") {
					value = value.replace(/'/g,"%27");
				}
                url += encodeURIComponent(value);
                if (idx != (params.length - 1)) {
                    url += "&";
                }
            }

            if (!bindsValid) {
                return false;
            }
        }

        var currPageNode = $(Td.Controls._currPage.getJQMId());
        if (currPageNode.data('pagetype') == 'login') {
            //if we're navigating away from a login page
            //force a fresh page load so the secured page app manifest
            //is downloaded for caching
            window.location.href = url;
        }
        else {
            Td.Util.showWaitIcon();
            $("body").pagecontainer("change", url, { showLoadMsg: false });
        }
    },

    /** 
     * Navigate back
     * @function
     * @memberof Td.Util
     */
    navBack: function () {
        $.mobile.back();
    },

    /** 
     * Show the menu for this page
     * @function
     * @memberof Td.Util
     * @param {string} menuId - The ID of the menu
     */
    showMenu: function (menuId) {
        if ($("#" + menuId).css('visibility') != 'visible') {
            $("#" + menuId).panel("open");
        }
    },

    /** 
     * Override the default display for this browser session
     * @function
     * @memberof Td.Util
     * @param {string} display - The extension mapping for the display
     */
    setDisplay: function (display) {
        document.cookie = "tdmobiledisplay=" + display;
        window.location.reload(true);
    },

    /** 
     * Set custom HTML to show in the JQM loader widget
     * @function
     * @memberof Td.Util
     * @param {string} html - The html to display.  The html
     * should have a single {0} format placeholder which will be an optional 
     * message supplied by user code
     */
    setWaitHtml: function (html) {
        Td.Util._waitHtml = html;
    },

    /** 
     * Show wait icon
     * @function
     * @memberof Td.Util
     * @param {string} msgText - Optional message to show
     */
    showWaitIcon: function (msgText) {
        var loader = $(".ui-loader");
        if (loader.length == 0 || loader.css('display') == 'none') {
            var hasText = true;
            if (typeof (msgText) == "undefined") {
                hasText = false;
                msgText = "";
            }
            if ($.mobile) {
                if (typeof (Td.Util._waitHtml) == "undefined") {
                    $.mobile.loading("show", {
                        text: msgText,
                        textVisible: hasText,
                        theme: $.mobile.loader.prototype.options.theme,
                        textonly: false
                    });
                }
                else {
                    var html = Td.Util._formatString(Td.Util._waitHtml, [msgText]);
                    $.mobile.loading("show", {
                        text: msgText,
                        textVisible: true,
                        theme: $.mobile.loader.prototype.options.theme,
                        textonly: true,
                        html: html
                    });
                }
            }
        }
    },

    /** 
     * Hide wait icon
     * @function
     * @memberof Td.Util
     */
    hideWaitIcon: function () {
        if ($.mobile) {
            $.mobile.loading("hide");
        }
    },

    //DateTime from .NET service can't be passed back to a service (brilliant!),
    //so this code will recurse a json object and convert the .NET format
    //to a js format that can be sent back
    _fixDates: function (jsonObj) {
        if (typeof (jsonObj) == "object") {
            if (jsonObj
                    && typeof (jsonObj.IsYearZero) != "undefined") {
                if (jsonObj.IsNull) {
                    jsonObj.Value = new Date(0, 0, 0);
                }
                else if (typeof (jsonObj.Value) == "string") {

                    if (jsonObj.Value.indexOf("/Date(") == 0) {
                        //Date is in ASP.NET date syntax, parse the number and construct a JS date
                        jsonObj.Value = new Date(parseInt(jsonObj.Value.substring(6)));;
                    }
                    else {
                        //If we JSON.stringify our SalDate object, the Value will be a string with a timezone offset,
                        //which differs from the format returned by asp.
                        jsonObj.Value = new Date(Date.parse(jsonObj.Value));
                    }
                }
            }
            for (var prop in jsonObj) {
                this._fixDates(jsonObj[prop]);
            }
        }
    },

    //String format like .NET
    _formatString: function (format, args) {
        return format.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] != 'undefined'
              ? args[number]
              : match;
        });
    },

    /** 
     * Show a message using JQM dialog window.
     * @function
     * @memberof Td.Util
     * @param {string} msg - The message to show, can be html formatted
     */
    showMessage: function (msg) {
        if ($.mobile) {
            $("body").append('<div id="__TDAlertMsgContainer"><div id="__TDAlertMsg" data-role="popup" class="ui-content" data-theme="a"></div></div>');
            $("#__TDAlertMsg").html(msg);
            $("#__TDAlertMsgContainer").trigger("create");
            $("#__TDAlertMsg").on(
                "popupafterclose",
                function (event, ui) {
                    $("#__TDAlertMsg").popup("destroy");
                    $("#__TDAlertMsgContainer").remove();
                });
            $("#__TDAlertMsg").popup("open");
        }
        else {
            window.alert(msg);
        }
    },

    /** 
     * Show an alert using JQM dialog window.
     * @function
     * @memberof Td.Util
     * @param {string} msg - The message to show, can be html formatted
     * @param {function} onOk - An optional function to call when the user clicks the OK button
     */
    alert: function (msg, onOk) {
        $("body").append(
            '<div id="__TDAlertMsgContainer">' +
            '  <div id="__TDAlertMsg" data-role="popup" data-dismissible="false" style="max-width:400px;" class="ui-corner-all" data-theme="a">' +
            '    <div data-role="content" class="ui-corner-bottom ui-content">' +
            '      <p id="__TDAlertMsgTxt"></p>' +
            '      <a id="__TDAlertOkBtn" href="#" data-role="button" data-inline="true" data-rel="back" data-mini="true">OK</a>' +
            '    </div>' +
            '  </div>' +
            '</div>'
            );

        if (onOk) {
            $("#__TDAlertOkBtn").click(function () {
                setTimeout(onOk, 100);
            });
        }

        $("#__TDAlertMsgTxt").html(msg);
        $("#__TDAlertOkBtn").text(Td.Localization.resolveByKey("OK"));
        $("#__TDAlertMsgContainer").trigger("create");
        $("#__TDAlertMsg").on(
            "popupafterclose",
            function (event, ui) {
                $("#__TDAlertMsg").popup("destroy");
                $("#__TDAlertMsgContainer").remove();
            });
        $("#__TDAlertMsg").popup("open");
    },

    /** 
     * Show a confirm dialog using JQM dialog window.
     * @function
     * @memberof Td.Util
     * @param {string} msg - The message to show, can be html formatted
     * @param {function} onYes - An optional function to call when the user clicks the yes button
     * @param {function} onNo - An optional function to call when the user clicks the no button
     */
    confirm: function (msg, onYes, onNo) {
        $("body").append(
           '<div id="__TDAConfirmMsgContainer">' +
           '  <div id="__TDConfirmMsg" data-role="popup" data-dismissible="false" style="max-width:400px;" class="ui-corner-all" data-theme="a">' +
           '    <div data-role="content" class="ui-corner-bottom ui-content">' +
           '      <p id="__TDConfirmMsgTxt"></p>' +
           '      <a id="__TDConfirmOkBtn" href="#" data-role="button" data-inline="true" data-rel="back" data-mini="true">Yes</a>' +
           '      <a id="__TDConfirmCancelBtn" href="#" data-role="button" data-inline="true" data-rel="back" data-mini="true">No</a>' +
           '    </div>' +
           '  </div>' +
           '</div>'
           );
        $("#__TDConfirmMsgTxt").html(msg);
        $("#__TDConfirmOkBtn").text(Td.Localization.resolveByKey("Yes"));
        $("#__TDConfirmCancelBtn").text(Td.Localization.resolveByKey("No"));

        if (onYes) {
            $("#__TDConfirmOkBtn").click(function () {
                setTimeout(onYes, 100);
            });
        }

        if (onNo) {
            $("#__TDConfirmCancelBtn").click(function () {
                setTimeout(onNo, 100);
            });
        }


        $("#__TDAConfirmMsgContainer").trigger("create");
        $("#__TDConfirmMsg").on(
            "popupafterclose",
            function (event, ui) {
                $("#__TDConfirmMsg").popup("destroy");
                $("#__TDAConfirmMsgContainer").remove();
            });
        $("#__TDConfirmMsg").popup("open");
    },

    /** 
     * Log a debug message to the console.
     * @function
     * @memberof Td.Util
     * @param {string} msg - The message to log
     */
    log: function (msg) {
        if (this.debug && window.console) {
            console.log(msg);
        }
    },

    //clear any control/bind etc. maps we maintain per page
    _clearMaps: function () {
        Td.Controls.clear();
        Td.Data.Binding.clear();
        Td.Data.Operation.clear();
    },

    /** 
     * Start a timer on the current page.
     * @function
     * @memberof Td.Util
     * @param {Number} milliseconds - The timer interval in milliseconds
     */
    setTimer: function (milliseconds) {

        if (Td.Util._timerID) {
            clearInterval(Td.Util._timerID);
        }

        Td.Util._timerID
            = setInterval(
                function () {
                    if (Td.Controls._currPage) {
                        Td.Controls._currPage.executeTimer();
                    }
                },
                milliseconds);
    },

    /** 
     * Clear a timer started from setTimer.
     * @function
     * @memberof Td.Util
     */
    clearTimer: function () {
        if (Td.Util._timerID) {
            clearInterval(Td.Util._timerID);
        }
    },

    /** 
     * Runs a report.
     * @function
     * @memberof Td.Util
     */
    runReport: function (reportId, reportName, outputType) {
        if (typeof (outputType) == "undefined") {
            outputType = "HTML";
        }
        var reportURL = "reports/view.ashx?ReportId=" + reportId + "&ReportName=" + encodeURIComponent(reportName) + "&OutputType=" + outputType;
        if (Td.Util.isCordovaApp()) {
            reportURL = Td.Config.getAppURL() + "/" + reportURL;
        }
        document.location.href = reportURL;
        //window.open("reports/view.ashx?ReportName=" + encodeURIComponent(reportName) + "&OutputType=" + outputType);
    },

    /** 
     * Returns true if the application is running under Apache Cordova.
     * Note: this is a simple test, will also return true if page is being run
     * on a desktop from the filesystem (using file URL).
     * @function
     * @memberof Td.Util
     */
    isCordovaApp: function () {
        return document.URL.indexOf('http://') === -1
                && document.URL.indexOf('https://') === -1;
    },

    /** 
     * Gets the value of a cookie, returns null if the cookie does not exist.
     * @function
     * @memberof Td.Util
     * @param {String} name - The name of the cookie
     */
    getCookieValue: function (name) {
        return decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + encodeURIComponent(name).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
    },

    _createRoleBind: function (role, value) {
        new Td.Data.Binding(
            "[hasrole:" + role + "]",
            "Boolean",
            {
                isSystemBind: true,
                initval: value,
                boolstate: {
                    booltype: "IsEqualTo",
                    compareval: true
                }
            }
        );
    }
};

Td.Util._initDebug();
Td.Util._initAjax();

/**
 * Static i18n functions
 * @namespace
 * @static
 */
Td.Localization = {

    _globalLookupTable: {},
    _numFormatInfo: {},

    /** 
     * Initialize localization
     * @function
     * @memberof Td.Localization
     * @param {string} fallBackLocale - The locale to use if no localized strings exists for the clients locale
     */
    init: function (fallBackLocale) {
        if (typeof (this.fallBackLocale) != "undefined") {
            //already set
            return;
        }
        this.fallBackLocale = fallBackLocale.toLowerCase();
        this.locale = window.navigator.userLanguage || window.navigator.language;
        this.locale = this.locale.toLowerCase();

        var cookieLocale = Td.Util.getCookieValue("tdmobilelocale");
        if (cookieLocale != null) {
            this.locale = cookieLocale;
        }

        if (this.locale.length == 2) {
            switch (this.locale) {
                case "en":
                    this.locale = "en-us";
                    break;
                case "ja":
                    this.locale = "ja-jp";
                    break;
                case "sv":
                    this.locale = "sv-se";
                    break;
                case "fr":
                    this.locale = "fr-fr";
                    break;
                default:
                    this.locale = this.locale + "-" + this.locale;
            }
        }
        Td.Data.Binding.get("[locale]").setValue(this.locale);
    },

    /** 
     * Set the locale to use when resolving strings
     * @function
     * @memberof Td.Localization
     * @param {string} locale - The locale key, i.e. en-US
     */
    setLocale: function (locale) {
        this.locale = locale;
        this.locale = this.locale.toLowerCase();
        $(this).trigger('localechanged');
        Td.Data.Binding.get("[locale]").setValue(this.locale);
        document.cookie = "tdmobilelocale=" + this.locale;
    },

    /** 
     * Looks up a string in a string table based off the current locale
     * @function
     * @memberof Td.Localization
     * @param {Object} stringTable - A map of locales to translations
     */
    resolve: function (stringTable) {

        if (typeof (stringTable) == "undefined") {
            return "";
        }

        var str = stringTable[this.locale];
        if (typeof (str) == "undefined") {
            str = stringTable[this.fallBackLocale];
        }

        if (typeof (str) == "undefined") {
            str = stringTable["en-us"];
        }
        return str;
    },

    /** 
     * Looks up a string by key in the global lookup table (keys registered by calling registerTranslations)
     * @function
     * @memberof Td.Localization
     * @param {string} key - key to resolve
     */
    resolveByKey: function (key) {
        var lookupTable = this._globalLookupTable[key];
        if (!lookupTable) {
            //if key not found, just return key value
            return key;
        }
        return this.resolve(lookupTable);
    },

    /** 
    * Register locale mapped strings.  The lookupTable map will be merged into
	* any existing registered keys, allowing this function to be called multiple
	* times.  Existing keys will be replaced, new ones added.
    * @function
    * @memberof Td.Localization
    * @param {Object} lookupTable - Map of keys, to their locale based translations.  { "foo": { "en-US" : "bar", "de-DE": "foobar" } }
    */
    registerTranslations: function (lookupTable) {
        $.extend(true, this._globalLookupTable, lookupTable);
    },

    /** 
    * Register locale specific number formats.  The map keys are the name's of the locales being registered,
    * the values are an object describing the number format.  The properties supported are dSep, the decimal character 
    * for that locale, and gSep, the group character.  
    * @function
    * @memberof Td.Localization
    * @param {Object} infoTable - Map of locale keys, to their number format info.  { "en-US": { dSep : ".", gSep: "," } }
    */
    registerNumberFormatInfo: function (infoTable) {
        $.extend(true, this._numFormatInfo, infoTable);
    },

    /** 
    * Format a number for the current locale.
    * @function
    * @memberof Td.Localization
    * @param {Number} num - The number to format
    */
    formatNumber: function (num) {
        if (typeof (num) == "number") {
            var strNum = num.toString();
            var fInfo = this._numFormatInfo[this.locale];

            if (typeof (fInfo) == "undefined") {
                return strNum;
            }

            var decSep = fInfo.dSep;
            strNum = strNum.replace('.', decSep);
            return strNum;
        }
        return num;
    },

    /** 
    * Parse a string to a number.  An attempt will be made to 
    * translate a locale formatted number to a format JavaScript can parse
    * natively with parseFloat.
    * @function
    * @memberof Td.Localization
    * @param {String} strNum - The string to parse 
    */
    parseNumber: function (strNum) {
        if (typeof (strNum) == "string") {
            var fInfo = this._numFormatInfo[this.locale];

            if (typeof (fInfo) == "undefined") {
                //assume it's in a format JS can handle natively
                return parseFloat(strNum);
            }

            var decSep = fInfo.dSep;
            strNum = strNum.replace(decSep, '.');
            return parseFloat(strNum);
        }
        return strNum;
    }
};

/**
 * Static functions for handling application configuration information
 * @namespace
 * @static
 */
Td.Config = {

    /** 
    * Init config data.
    * @function
    * @memberof Td.Config
    * @param {Object} config - app config object from app.config.js
    */
    init: function (config) {
        this.config = config;
    },

    /** 
    * Gets the application URL config setting.
    * @function
    * @memberof Td.Config
    */
    getAppURL: function () {
        if (this.config) {
            return this.config["AppUrl"];
        }
        return "";
    },

    /** 
    * Maps a page name to its file name based on the desired display (i.e. Home -> Home.p.html).
    * @function
    * @memberof Td.Config
    */
    mapPageToDisplay: function (pageName) {
        var mappedPageName = pageName;
        if (this.config) {
            var targetDisp = this.config["TargetDisplay"];
            var pageMap = this.config["Pages"];
            if (pageMap) {
                var pageInfo = pageMap[pageName];
                if (pageInfo) {
                    if ((targetDisp == "Tablet"
                            && pageInfo.hasTabletDisplay)
                            || (targetDisp == "Phone" && !pageInfo.hasPhoneDisplay)) {
                        mappedPageName = pageName + ".t.html";
                    } else {
                        mappedPageName = pageName + ".p.html";
                    }
                }
            }
        }
        return mappedPageName;
    }
};

/**
 * Static Cordova utility functions
 * @namespace
 * @static
 */
Td.Cordova = {

    /** 
    * Scans a barcode using the Cordova barcode scanner plugin (https://github.com/wildabeast/BarcodeScanner).
    * @function
    * @memberof Td.Cordova
    * @param {String} bindName - Name of bind to update with result
    * @param {String} bindPath - Optional bind path to update with result
    * @param {Object} onSuccess - Success callback
    * @param {Object} onFail - Fail callback
    */
    scanBarCode: function (bindName, bindPath, onSuccess, onFail) {
        if (typeof (cordova) == "undefined"
                || typeof (cordova.plugins.barcodeScanner) == "undefined") {
            alert('Cordova barcode scanner not installed');
            onFail();
            return;
        }
        cordova.plugins.barcodeScanner.scan(
            function (result) {
                if (!result.cancelled) {
                    Td.Data.Binding.get(bindName).setValue(result.text, bindPath)
                    onSuccess();
                }
                else {
                    onFail();
                }
            },
            function (error) {
                onFail();
            }
        );
    }
}

//create system binding for geolocation
new Td.Data.GeoBinding(
    "[geolocation]",
	"GeoLocation",
	{
	    isSystemBind: true,
	    initval: "",
	    boolstate: {
	        booltype: "DoesntEqualValue",
	        compareval: null
	    }
	}
);

//create system binding for display
new Td.Data.Binding(
    "[display]",
	"String",
	{
	    isSystemBind: true,
	    initval: "",
	    boolstate: {
	        booltype: "DoesntEqualValue",
	        compareval: null
	    }
	}
);

//create system binding for locale
new Td.Data.Binding(
    "[locale]",
	"String",
	{
	    isSystemBind: true,
	    initval: "",
	    boolstate: {
	        booltype: "DoesntEqualValue",
	        compareval: null
	    }
	}
);

//create system binding for server errors
new Td.Data.Binding(
    "[error]",
	"Functional Class",
	{
	    isSystemBind: true,
	    boolstate: {
	        booltype: "NotNull",
	        compareval: ""
	    },
	    members:
			[
				{
				    name: "message",
				    type: "String",
				    opts: {
				        boolstate: {
				            booltype: "NotNull",
				            compareval: ""
				        },
				        initval: ""
				    }
				},
				{
				    name: "code",
				    type: "Number",
				    opts: {
				        boolstate: {
				            booltype: "DoesntEqualValue",
				            compareval: "0"
				        },
				        initval: null
				    }
				},
				{
				    name: "operation",
				    type: "String",
				    opts: {
				        boolstate: {
				            booltype: "NotNull",
				            compareval: ""
				        },
				        initval: ""
				    }
				},
                {
                    name: "type",
                    type: "String",
                    opts: {
                        boolstate: {
                            booltype: "NotNull",
                            compareval: ""
                        },
                        initval: ""
                    }
                }
			]
	}
);

//create system binding for online
var onlineBind = new Td.Data.Binding(
    "[online]",
	"Boolean",
	{
	    isSystemBind: true,
	    initval: true,
	    boolstate: {
	        booltype: "IsEqualTo",
	        compareval: true
	    }
	}
);

//create system binding for orientation
var orientationBind = new Td.Data.Binding(
    "[orientation]",
	"Boolean",
	{
	    isSystemBind: true,
	    initval: "",
	    boolstate: {
	        booltype: "IsEqualTo",
	        compareval: true
	    }
	}
);

//create system binding to store report ID
new Td.Data.Binding(
    "[report_id]",
	"String",
	{
	    isSystemBind: true,
	    initval: "",
	    boolstate: {
	        booltype: "DoesntEqualValue",
	        compareval: null
	    }
	}
);

//event listeners for online bind
onlineBind.setValue(navigator.onLine);

$(window).on("offline", function () {
    onlineBind.setValue(false);
    if (Td.Controls._currPage) {
        Td.Controls._currPage.raiseOnlineStatusChanged();
    }
});

$(window).on("online", function () {
    onlineBind.setValue(true);
    if (Td.Controls._currPage) {
        Td.Controls._currPage.raiseOnlineStatusChanged();
    }
});

//event listeners for orientation bind
$(window).on("orientationchange", function (event) {
    orientationBind.setValue(event.orientation == "landscape");
    if (Td.Controls._currPage) {
        Td.Controls._currPage.raiseOrientationChange();
    }
});

//force event so we have an initial value
$(window).orientationchange();

//clear maps before page init code is called
$(document).on("pagebeforeshow", function (e) {
    Td.Util._clearMaps();
    Td.Util.clearTimer();
});

//jquery mobile caches the first page's DOM (yuck!), which causes
//headaches for us.  Pulled this fix from:
//https://github.com/jquery/jquery-mobile/issues/3249
//Bug will hopefully be fixed in future release of jqm.
$(document).on("pagechange.fixcache", function (event, info) {
    if ($.mobile.page.prototype.options.domCache || $.mobile.firstPage.is('[data-dom-cache="true"]')) {
        $(document).off("pagechange.fixcache");
    }
    else if (info.options.fromPage != undefined && info.toPage.attr('data-url') != info.options.fromPage.attr('data-url')) {
        jQuery.mobile.firstPage.remove();
        $(document).off("pagechange.fixcache");
    }
});