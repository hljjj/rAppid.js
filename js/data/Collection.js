define(['require', "js/core/List", "js/data/Model", "flow", "underscore", "js/data/Query"], function (require, List, Model, flow, _, Query) {

    var State = {
        CREATED: 0,
        LOADING: 1,
        LOADED: 2,
        ERROR: -1
    };

    var Collection = List.inherit("js.data.Collection", {

        $modelFactory: Model,

        isCollection: true, // read only to determinate if its a collection and prevent circular dependencies

        ctor: function (items, options) {
            options = options || {};

            _.defaults(options, {
                root: null,
                query: null,
                pageSize: null,
                queryParameters: {},
                sortParameters: null,
                factory: this.$modelFactory || require('js/data/Model'),
                type: null
            });


            this.$filterCache = {};
            this.$sortCache = {};

            if (options.root) {
                _.defaults(options, options.root.options);
                this.$modelFactory = options.root.$modelFactory;
            }

            this.callBase(items, options);

            this.$queryCollectionsCache = {};
            this.$sortCollections = [];
            this.$pageCache = [];
        },

        createQueryCacheKey: function (queryParameters) {
            queryParameters = queryParameters || {};
            var ret = [];

            for (var key in queryParameters) {
                if (queryParameters.hasOwnProperty(key)) {
                    ret.push(key + "=" + JSON.stringify(queryParameters[key]));
                }
            }

            ret.sort();

            if (ret.length == 0) {
                return "root";
            }

            return ret.join("&");
        },

        /***
         *
         * @param {js.data.Query} query
         * @return {*}
         */
        filter: function (query) {
            if (query instanceof Query && query.query.where) {
                var options = _.defaults({}, this.$, {
                    query: query,
                    root: this.getRoot()
                });

                var filterCacheId = query.whereCacheId();

                if (!this.$filterCache[filterCacheId]) {
                    this.$filterCache[filterCacheId] = this._createFilteredCollection(query, options);
                }

                return this.$filterCache[filterCacheId];
            } else {
                return this.getRoot();
            }
        },

        _createFilteredCollection: function (query, options) {
            options.$itemsCount = undefined;

            var collection = new this.factory(null, options);
            collection.$context = this.$context;

            return collection;
        },

        _createSortedCollection: function (query, options) {
            // TODO: if fully loaded -> return this.callBase();
            var collection = new this.factory(null, options);
            collection.$context = this.$context;

            return collection;
        },

        sort: function (query) {
            if (query instanceof Query && query.query.sort) {


                var options = _.defaults({}, this.$, {
                    query: query,
                    root: this.getRoot()
                });

                var sortCacheId = query.sortCacheId();

                if (!this.$sortCache[sortCacheId]) {
                    this.$sortCache[sortCacheId] = this._createSortedCollection(query, options);
                }

                return this.$sortCache[sortCacheId];
            }

            return this;
        },

        query: function (query) {
            return this.filter(query).sort(query);
        },

        getRoot: function () {
            return this.$.root || this;
        },

        // fetches the complete list
        fetch: function (options, callback) {
            options = options || {};

            var self = this;

            function fetchPages(pageCount) {
                var delegates = [];

                function addFetchPageDelegate(pageIndex) {
                    delegates.push(function (cb) {
                        self.fetchPage(pageIndex, options, cb);
                    });
                }

                for (var i = 0; i < pageCount; i++) {
                    addFetchPageDelegate(i);
                }

                // execute loading parallel
                flow()
                    .par(delegates)
                    .exec(function (err) {
                        if (callback) {
                            callback(err, self);
                        }
                    });
            }

            if (!this.$.pageSize) {
                // unlimited pageSize -> create one and only page and fetch
                this.fetchPage(0, options, callback);
            } else {
                // determinate pages
                var pageCount = this.pageCount();

                if (!isNaN(pageCount)) {
                    // we know how many page are there
                    fetchPages(pageCount);
                } else {
                    // load first page in order to get the available itemCount
                    // to calculate the pageCount
                    this.fetchPage(0, options, function (err) {
                        if (!err) {
                            // we now should calculate a page count
                            pageCount = self.pageCount();

                            if (isNaN(pageCount)) {
                                if (callback) {
                                    callback("Count for collection couldn't be fetched.", self);
                                }
                            } else {
                                fetchPages(pageCount);
                            }
                        } else {
                            if (callback) {
                                callback(err, self);
                            }
                        }
                    })
                }
            }

        },

        pageCount: function () {
            if (this.$.hasOwnProperty("$itemsCount")) {
                return Math.ceil(this.$.$itemsCount / this.$.pageSize);
            } else {
                // we actually don't know how many pages there will be
                return NaN;
            }
        },

        getContextForChild: function (childFactory) {
            return this.$context;
        },

        parse: function (data) {
            return data;
        },

        createItem: function (id) {
            var item = this.getContextForChild(this.$modelFactory).createEntity(this.$modelFactory, id);

            item.$parent = this.$parent;
            item.$collection = this;

            return item;
        },

        fetchPage: function (pageIndex, options, callback) {

            if (pageIndex < 0) {
                throw "pageIndex must be >= 0";
            }

            var page = this.$pageCache[pageIndex];
            if (!page) {
                page = this.$pageCache[pageIndex] = new Page(null, this, pageIndex);
            }

            var self = this;
            options = _.extend(this.$, options);
            page.fetch(options, function (err, page) {
                // insert data into items if not already inserted
                if (!err && !page.itemsInsertedIntoCollection) {
                    page.itemsInsertedIntoCollection = true;

                    // add items to collection
                    self.add(page.$items, {
                        index: (pageIndex || 0) * self.$.pageSize
                    });
                }

                if (callback) {
                    callback(err, page, options);
                }
            });
        },

        invalidatePageCache: function () {
            this.$pageCache = {};

            for (var key in this.$filterCache) {
                if (this.$filterCache.hasOwnProperty(key)) {
                    this.$filterCache[key].invalidatePageCache();
                }
            }

            for (key in this.$sortCache) {
                if (this.$sortCache.hasOwnProperty(key)) {
                    this.$sortCache[key].invalidatePageCache();
                }
            }

            this.set('$itemsCount', NaN, {silent: true});
            this.reset([]);
        },

        size: function () {
            return this.$.$itemsCount;
        }.onChange('$itemsCount'),

        isEmpty: function () {
            var pageCount = this.pageCount();
            if (!isNaN(pageCount)) {
                return pageCount === 0;
            }
            return false;
        }.onChange('$itemsCount'),

        getQueryParameters: function (method) {
            return this.$.queryParameters;
        },
        getSortParameters: function (method) {
            return this.$.sortParameters;
        },
        destroy: function () {
            // TODO: remove destroyed query collections from cache

            this.callBase();
        }
    });

    var Page = Collection.Page = List.inherit({

        ctor: function (items, collection, pageIndex) {
            if (!collection.$.pageSize && pageIndex !== 0) {
                throw "Cannot create page for index '" + pageIndex + "' with pageSize '" + collection.options.pageSize + "'";
            }

            var options = collection.$;

            if (options.pageSize) {
                this.$offset = pageIndex * options.pageSize;
                this.$limit = options.pageSize;
            }

            this.$pageIndex = pageIndex;
            this.$collection = collection;

            this.callBase(items);

            // stores the current fetch state
            this._fetch = {
                callbacks: [],
                state: State.CREATED
            };

        },

        setMetaData: function (metaData) {
            this.$metaData = metaData;

            if (metaData && metaData.hasOwnProperty('count')) {
                // set itemsCount in collection for page calculation
                this.$collection.set('$itemsCount', metaData.count);
            }
        },

        parse: function (data, type) {
            return this.getRoot().parse(data, type);
        },

        getRoot: function () {
            return this.$collection.getRoot();
        },
        /***
         *
         * @param options
         * @param [Boolean] [options.fetchModels=false] fetch models inside collection
         * @param [Array] [options.fetchSubModels] fetch sub models
         * @param callback
         */
        fetch: function (options, callback) {
            options = options || {};

            var self = this;

            function pageFetchedComplete(err, page, originalCallback) {
                var callback = function (err, page) {
                    if (originalCallback) {
                        originalCallback(err, page, options)
                    }
                };


                if (options.fetchModels || options.fetchSubModels) {

                    // TODO: introduce poolSize parameter for par, and parEach

                    flow()
                        .parEach(page.$items, function (model, cb) {
                            model.fetch({
                                fetchSubModels: options.fetchSubModels
                            }, cb);
                        })
                        .exec(function (err) {
                            callback(err, page);
                        });

                } else {
                    callback(err, page);
                }

            }

            if (this._fetch.state === State.LOADING) {
                // currently fetching -> register callback
                this._fetch.callbacks.push(function (err, page) {
                    pageFetchedComplete(err, page, callback);
                });
            } else if (this._fetch.state == State.LOADED) {
                // completed loaded -> execute
                pageFetchedComplete(null, this, callback);
            } else {
                // set state and start loading
                self._fetch.state = State.LOADING;

                this.$collection.$context.$dataSource.loadCollectionPage(this, options, function (err, page) {
                    self._fetch.state = err ? State.ERROR : State.LOADED;

                    // execute callbacks
                    pageFetchedComplete(err, page, callback);

                    _.each(self._fetch.callbacks, function (cb) {
                        cb(err, page);
                    });
                });
            }
        }
    });

    Collection.of = function (modelFactory) {

        if (modelFactory instanceof Function) {
            return Collection.inherit(Collection.prototype.constructor.name + '[' + modelFactory.prototype.constructor.name + ']', {
                $modelFactory: modelFactory
            });
        } else {
            throw "Cannot create Collection of '" + modelFactory + "'.";
        }


    };

    return Collection;
});