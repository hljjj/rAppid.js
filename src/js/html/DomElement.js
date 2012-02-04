rAppid.defineClass("js.html.DomElement",
    ["js.core.Component","js.core.Binding"], function (Component, Binding) {
        return Component.inherit({
                ctor:function (attributes) {
                    this.base.ctor.callBase(this, attributes);

                    if (attributes) {
                        this.$tagName = attributes.tagName;
                    }
                },
                _construct:function (descriptor, applicationDomain, scope) {
                    this.base._construct.callBase(this, descriptor, applicationDomain, scope);

                    if (this.$descriptor) {
                        if (!this.$tagName) {
                            this.$tagName = this.$descriptor.localName;
                        }
                        if (!this.$namespace) {
                            this.$namespace = this.$descriptor.namespaceURI;
                        }
                    }
                },
                _initializeAttributes:function (attributes) {
                    this.base._initializeAttributes.callBase(this, attributes);

                    if (attributes.tagName) {
                        this.$tagName = attributes.tagName;
                    }

                    var attr;
                    // find bindings
                    for(var key in attributes){
                        if(attributes.hasOwnProperty(key)){
                            attr = attributes[key];
                            if(attr instanceof Binding){

                            }
                        }
                    }
                },
                render:function () {
                    if (!this.$initialized) {
                        this._initialize(this.$creationPolicy);
                    }
                    // check if it is already rendered
                    if (this.isRendered()) {
                        return this.$el;
                    }

                    this.$el = document.createElement(this.$tagName);

                    this._renderAttributes(this.$);

                    // for all children
                    var child;
                    for (var i = 0; i < this.$children.length; i++) {
                        child = this.$children[i];
                        this._renderChild(child);
                    }

                    return this.$el;
                },
                _renderChild: function(child){
                    if (_.isFunction(child.render)) {
                        var el = child.render();
                        if (el) {
                            this.$el.appendChild(el);
                        }
                    }
                },
                isRendered:function () {
                    return typeof (this.$el) !== "undefined";
                },
                _renderAttributes:function (attributes) {
                    var attr;
                    for (var key in attributes) {
                        if (attributes.hasOwnProperty(key)) {
                            attr = attributes[key];
                            this._renderAttribute(key,attr);
                        }
                    }
                },
                _renderAttribute: function(key,attr){
                    if (_.isString(attr)) {
                        this.$el.setAttribute(key, attr);
                    }
                }
            }
        )
    }
);