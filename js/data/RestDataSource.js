define(["js/data/DataSource", "js/core/Base", "js/data/Model", "underscore", "flow", "JSON", "js/data/Collection", "require", "js/lib/query/composer/RestQueryComposer"], function (DataSource, Base, Model, _, flow, JSON, Collection, requirejs, RestQueryComposer) {

    var rIdExtractor = /http.+\/([^/]+)$/;

    var RestDataProcessor = DataSource.Processor.inherit('js.data.RestDataSource.RestDataProcessor', {
        _composeSubModel: function (model, action, options) {
            return {
                id: model.$.id
            };
        }
    });

    var RestDataSource = DataSource.inherit("js.data.RestDataSource", {

        defaults: {
            endPoint: null,
            gateway: null,
            determinateContextAttribute: "href",
            parsePayloadOnCreate: true,
            parsePayloadOnUpdate: true,
            useSafeHttpMethods: false
        },

        ctor: function () {
            this.callBase();
        },

        $defaultProcessorFactory: RestDataProcessor,

        initialize: function () {

            if (!this.$.endPoint) {
                this.log("No end-point for RestDataSource defined", "warn");
            }

            if (!this.$.gateway) {
                this.$.gateway = this.$.endPoint;
            }

        },

        _validateConfiguration: function () {
            if (!this.$dataSourceConfiguration) {
                throw "No DataSourceConfiguration specified";
            }
        },

        initializeFormatProcessors: function () {

            var jsonProcessor = new DataSource.JsonFormatProcessor();
            jsonProcessor.regex = /json/;

            this.$formatProcessors.push(jsonProcessor);

        },

        /***
         * creates the context as RestContext
         *
         * @param properties
         * @param parentContext
         * @return {js.core.RestDataSource.RestContext}
         */
        createContext: function (contextModel, properties, parentContext) {
            return new RestDataSource.RestContext(this, contextModel, properties, parentContext);
        },

        /***
         * global query parameter for each REST action
         * @param action {String} Rest action [GET, PUT, DELETE, POST]
         * @param resource {js.data.Model|js.data.Collection} model or collection which gets loaded
         * @return {Object}
         */
        getQueryParameters: function (action, resource) {

            var params = {};

            if (this.$.useSafeHttpMethods) {
                if (action === RestDataSource.METHOD.DELETE) {
                    params.method = "delete"
                } else if (action === RestDataSource.METHOD.PUT) {
                    params.method = "put";
                }
            }

            if(resource instanceof Collection){
                _.defaults(params, resource.getQueryParameters(action), resource.getRoot().$context.getQueryParameters());
                if(resource.$.query){
                    _.defaults(params, this.getQueryComposer().compose(resource.$.query));
                }
            }

            return params;
        },

        getQueryComposer: function(){
            return RestQueryComposer.RestQueryComposer;
        },


        _getHttpMethod: function (method) {

            if (this.$.useSafeHttpMethods) {
                if (method === RestDataSource.METHOD.PUT || method === RestDataSource.METHOD.DELETE) {
                    return RestDataSource.METHOD.POST;
                }
            }

            return method
        },


        getPathComponentsForResource: function (resource) {

            if (resource instanceof Collection) {
                return this.getPathComponentsForModelClass(resource.$modelFactory);
            } else if (resource instanceof Model) {
                return this.getPathComponentsForModel(resource);
            }

            return null;
        },

        getPathComponentsForModel: function (model) {

            if (model) {

                var path = this.getPathComponentsForModelClass(model.factory);
                if (path) {
                    if (!model.isNew()) {
                        path.push(model.$.id);
                    }

                    return path;
                }

            }

            return null;
        },

        getPathComponentsForModelClass: function (modelClass) {

            if (modelClass) {
                var config = this.$dataSourceConfiguration.getConfigurationForModelClass(modelClass);

                if (config) {

                    var path = config.$.path;
                    if (path) {
                        return [path];
                    }
                }
            }

            return null;
        },

        _buildUriForResource: function (resource, endPoint) {


            // map resource to url
            var pathComponents = this.getPathComponentsForResource(resource);

            if (!pathComponents) {
                throw new Error("path for resource unknown");
            }

            // build uri
            var uri = [endPoint || this.$.gateway];
            uri = uri.concat(resource.$context.getPathComponents());
            uri = uri.concat(pathComponents);

            if (this.$.suffix) {
                uri[uri.length - 1] = uri[uri.length - 1] + "." + this.$.suffix;
            }

            return uri.join("/");
        },

        /**
         *
         * @param model
         * @param options
         * @param callback function(err, model, options)
         */
        loadModel: function (model, options, callback) {
            var self = this;

            // create url
            var url = this._buildUriForResource(model);

            // get queryParameter
            var params = _.defaults(model.$context.getQueryParameters(),
                this.getQueryParameters(RestDataSource.METHOD.GET, model));

            if (options.noCache) {
                params.timestamp = (new Date().getTime());
            }

            flow()
                .seq("xhr", function (cb) {
                    // send request
                    self.$stage.$applicationContext.ajax(url, {
                        type: RestDataSource.METHOD.GET,
                        queryParameter: params
                    }, cb);
                })
                .seq(function (cb) {
                    var xhr = this.vars.xhr;

                    if (xhr.status === 200 || xhr.status === 304) {
                        // find processor that matches the content-type
                        self._parseModelPayload(xhr, model, options);

                        cb(null, model, options);

                    } else {
                        // TODO: better error handling
                        cb("Got status code " + xhr.status + " for '" + url + "'", xhr, null, options);
                    }
                })
                .exec(function (err) {
                    if (callback) {
                        callback(err, model, options);
                    }
                });

        },

        _parseModelPayload: function (xhr, model, options) {
            var contentType = xhr.getResponseHeader("Content-Type");

            var formatProcessor = this.getFormatProcessorForContentType(contentType);

            if (!formatProcessor) {
                throw new Error("No formatProcessor for content type '" + contentType + "' found", null, options);
            }

            // deserialize data with format processor
            var data = formatProcessor.deserialize(xhr.responses.text);

            var processor = this.getProcessorForModel(model, options);

            // parse data inside processor
            data = processor.parse(model, data, DataSource.ACTION.LOAD, options);

            // parse data inside model
            data = model.parse(data);

            // set data
            model.set(data);

        },

        /***
         *
         * @param request.url
         * @param request.queryParameter
         * @param request.model
         * @param request.options
         * @param xhr
         * @param callback
         */
        handleSaveError: function (request, xhr, callback) {
            if (callback) {
                callback({
                    status: xhr.status,
                    statusText: xhr.statusText,
                    responses: xhr.responses,
                    xhr: xhr
                });
            }
        },

        /***
         *
         * @param request.url
         * @param request.queryParameter
         * @param request.model
         * @param request.options
         * @param xhr
         * @param callback
         */
        handleCreationSuccess: function (request, xhr, callback) {

            var model = request.model;

            var cb = function (err) {
                if (callback) {
                    callback(err, model, request.options);
                }
            };

            var self = this;

            try { // get location header
                var location = xhr.getResponseHeader('Location');

                if (location) {

                    if (self.$.parsePayloadOnCreate) {
                        self._parseModelPayload(xhr, model, request.options);
                    }

                    // extract id
                    var id = this.extractIdFromLocation(location, request);

                    if (id || id === 0) {
                        model.set('id', id);

                        var schema = model.schema, schemaType;
                        for (var schemaKey in schema) {
                            if (schema.hasOwnProperty(schemaKey)) {
                                schemaType = schema[schemaKey];
                                if (schemaType.classof && schemaType.classof(Collection)) {
                                    var contextForChildren = model.getContextForChild(schemaType);
                                    model.set(schemaKey, contextForChildren.createCollection(schemaType, null));
                                }

                            }
                        }

                        model.$context.addEntityToCache(model);

                        // TODO: ask processor if i should call save again to put content
                        cb(null);
                    } else {
                        cb("Id couldn't be extracted");
                    }

                } else {
                    cb('Location header not found');
                }

            } catch(e) {
                cb(e || true);
            }
        },

        _getContext: function (factory, parent, data) {
            if (this.$.determinateContextAttribute) {

                if (!data) {
                    return null;
                }

                if (data.hasOwnProperty(this.$.determinateContextAttribute)) {

                    var path = this._getContextPath(data),
                        components = path.split("/"),
                        configuration,
                        context = this.root(),
                        contextFactory,
                        id,
                        pathElement;

                    if (components[0] === "") {
                        components.shift();
                    }

                    for (var i = 0; i < components.length - 2; i = i + 2) {
                        pathElement = components[i];
                        id = components[i + 1];

                        if (!configuration) {
                            configuration = this.$dataSourceConfiguration.getConfigurationByKeyValue("path", pathElement);
                        } else {
                            configuration = configuration.getConfigurationByKeyValue("path", pathElement);
                        }
                        if (!configuration) {
                            throw new Error("Couldn't find configuration for path element " + i + " of " + components.join("/") + " ");
                        }

                        contextFactory = requirejs(configuration.$.modelClassName.replace(/\./g, "/"));

                        var entity = context.createEntity(contextFactory, id);
                        context = context.getContext(entity);

                    }

                    return context;
                }
            }

            return this.callBase();
        },

        _getContextPath: function(data) {
            return data[this.$.determinateContextAttribute].substr(this.$.endPoint.length + 1);
        },

        /***
         *
         * @param request.url
         * @param request.queryParameter
         * @param request.model
         * @param request.options
         * @param xhr
         * @param callback
         */
        handleUpdateSuccess: function (request, xhr, callback) {

            var model = request.model;

            if (this.$.parsePayloadOnUpdate) {
                this._parseModelPayload(xhr, model, request.options);
            }

            if (callback) {
                callback(null, model, request.options);
            }
        },

        extractIdFromLocation: function (location, request) {
            var param = rIdExtractor.exec(location);

            if (param) {
                return param[1];
            }

            return null;
        },

        _saveModel: function (model, options, callback) {
            options = options || {};

            var action = DataSource.ACTION.UPDATE,
                method = RestDataSource.METHOD.PUT;

            if (model._status() === Model.STATE.NEW) {
                action = DataSource.ACTION.CREATE;
                method = RestDataSource.METHOD.POST;
            }

            var processor = this.getProcessorForModel(model, options);
            var formatProcessor = this.getFormatProcessor(action, model);
            var self = this;

            // call save of the processor to save sub models
            flow()
                .seq(function (cb) {
                    processor.saveSubModels(model, options, cb)
                })
                .seq(function (cb) {
                    // create url
                    var url = self._buildUriForResource(model);

                    // get queryParameter
                    var params = _.defaults(model.$context.getQueryParameters(),
                        self.getQueryParameters(method, model));

                    method = self._getHttpMethod(method);

                    // TODO: create hook, which can modify url and queryParameter

                    var data = processor.compose(model, action, options);

                    // format payload
                    var payload = formatProcessor.serialize(data);

                    // send request
                    self.$stage.$applicationContext.ajax(url, {
                        type: method,
                        queryParameter: params,
                        data: payload,
                        xhrCreated: options.xhrCreated,
                        xhrBeforeSend: options.xhrBeforeSend,
                        contentType: formatProcessor.getContentType()
                    }, function (err, xhr) {

                        var request = {
                            url: url,
                            queryParameter: params,
                            model: model,
                            options: options
                        };

                        if (!err && action === DataSource.ACTION.CREATE && xhr.status === 201) {
                            self.handleCreationSuccess(request, xhr, cb)
                        } else if (!err && action === DataSource.ACTION.UPDATE && xhr.status === 200) {
                            self.handleUpdateSuccess(request, xhr, cb);
                        }
                        else {
                            // error handling
                            self.handleSaveError(request, xhr, cb);
                        }

                    });
                })
                .exec(function (err) {
                    callback && callback(err, model, options);
                })


        },
        extractListMetaData: function (list, payload, options) {
            return payload;
        },

        extractListData: function (list, payload, options) {
            for (var key in payload) {
                if (payload.hasOwnProperty(key)) {
                    if (_.isArray(payload[key])) {
                        return payload[key];
                    }
                }
            }
        },

        loadCollectionPage: function (collectionPage, options, callback) {

            var rootCollection = collectionPage.getRoot();
            var config = this.$dataSourceConfiguration.getConfigurationForModelClass(rootCollection.$modelFactory);

            if (!config) {
                throw new Error("Couldnt find path config for " + rootCollection.$modelFactory.prototype.constructor.name);
            }
            var modelPathComponents = [config.$.path];


            if (!modelPathComponents) {
                callback("path for model unknown", null, options);
                return;
            }

            var params = {};

            _.defaults(params, (options || {}).params, this.getQueryParameters(RestDataSource.METHOD.GET, collectionPage.$collection));

            if (collectionPage.$limit) {
                params.limit = collectionPage.$limit;
            }

            if (collectionPage.$offset) {
                params.offset = collectionPage.$offset;
            }

            if (options.noCache) {
                params.timestamp = (new Date()).getTime();
            }
            params.fullData = options.fullData || false;

            for (var key in params) {
                if (params.hasOwnProperty(key)) {
                    if (_.isObject(params[key])) {
                        params[key] = JSON.stringify(params[key]);
                    }
                }
            }

            // create url
            var url = this._buildUriForResource(rootCollection);
            var self = this;

            // send request
            this.$stage.$applicationContext.ajax(url, {
                type: RestDataSource.METHOD.GET,
                queryParameter: params
            }, function (err, xhr) {
                if (!err && (xhr.status == 200 || xhr.status == 304)) {
                    // find formatProcessor that matches the content-type
                    var contentType = xhr.getResponseHeader("Content-Type");
                    var formatProcessor = self.getFormatProcessorForContentType(contentType);

                    if (!formatProcessor) {
                        callback("No formatProcessor for content type '" + contentType + "' found", null, options);
                        return;
                    }

                    try {
                        // deserialize data with formatProcessor
                        var payload = formatProcessor.deserialize(xhr.responses.text);

                        // extract meta data
                        var metaData = self.extractListMetaData(collectionPage, payload, options);

                        if (metaData && metaData.hasOwnProperty('count')) {
                            // set itemsCount in collection for page calculation
                            collectionPage.$collection.set('$itemsCount', metaData.count);
                        }

                        // extract data from list result
                        var data = self.extractListData(collectionPage, payload, options);

                        var processor = self.getProcessorForCollection(collectionPage);

                        data = processor.parseCollection(collectionPage.getRoot(), data, DataSource.ACTION.LOAD, options);

                        collectionPage.add(data);

                        callback(null, collectionPage, options)

                    } catch(e) {
                        self.log(e, 'error');
                        callback(e, collectionPage, options);
                    }

                } else {
                    // TODO: better error handling
                    err = err || "wrong status code";
                    callback(err, collectionPage, options);
                }
            });
        },

        _createSortParameter: function (sortParmeters) {
            var parameters = null,
                sortFields = [];
            for (var key in sortParmeters) {
                if (sortParmeters.hasOwnProperty(key)) {
                    parameters = parameters || {};
                    sortFields.push((sortParmeters[key] === -1 ? "+" : "-")+key);
                }
            }
            if(sortFields.length > 0){
                parameters = {
                    sort: "("+sortFields.join(",")+")"
                }
            }
            return parameters;
        },

        removeModel: function (model, options, callback) {
            callback = callback || function () {

            };

            // create url
            var url = this._buildUriForResource(model);

            var method = RestDataSource.METHOD.DELETE;

            // get queryParameter
            var params = _.defaults(model.$context.getQueryParameters(),
                this.getQueryParameters(method, model));

            method = this._getHttpMethod(method);

            this.$stage.$applicationContext.ajax(url, {
                type: method,
                queryParameter: params
            }, function (err, xhr) {
                if (!err && (xhr.status == 200 || xhr.status == 304)) {
                    callback(null, model);
                } else {
                    // TODO: better error handling
                    err = err || "wrong status code";
                    callback(err, model);
                }
            });
        },
        getFormatProcessorForContentType: function (contentType) {
            for (var i = 0; i < this.$formatProcessors.length; i++) {
                var processorEntry = this.$formatProcessors[i];
                if (processorEntry.regex.test(contentType)) {
                    return processorEntry;
                }
            }

            return null;
        }

    });

    RestDataSource.RestContext = DataSource.Context.inherit("js.data.RestDataSource.Context", {

        getPathComponents: function () {

            var path = [];

            if (this.$parent) {
                path = this.$parent.getPathComponents();
            } else {
                return [];
            }

            if (!this.$contextModel) {
                throw new Error("ContextModel missing for non-root-Context");
            }

            var configuration = this.$dataSource.getConfigurationForModelClass(this.$contextModel.factory);
            path.push(configuration.$.path, this.$contextModel.$.id);

            return path;

        },

        createCollection: function (factory, options, type) {
            options = options || {};
            _.defaults(options, {
                pageSize: this.$dataSource.$.collectionPageSize || 100
            });

            return this.callBase(factory, options, type);
        },

        getQueryParameters: function () {
            return {};
        }
    });


    RestDataSource.METHOD = {
        GET: 'GET',
        POST: 'POST',
        PUT: 'PUT',
        DELETE: 'DELETE'
    };

    // TODO: implement XmlProcessor
    RestDataSource.XmlFormatProcessor = DataSource.FormatProcessor.inherit("js.data.RestDataSource.XmlFormatProcessor", {
        serialize: function (data) {
            throw "not implemented";
        },
        deserialize: function (responses) {
            throw "not implemented";
        }
    });

    RestDataSource.RestDataProcessor = RestDataProcessor;

    return RestDataSource;
});