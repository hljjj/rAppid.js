var esprima = require('esprima'),
    inherit = require('inherit.js').inherit,
    undefined,
    DomParser = require('xmldom').DOMParser,
    _ = require('underscore'),
    CONST = {
        AssignmentExpression: 'AssignmentExpression',
        ArrayExpression: 'ArrayExpression',
        BlockStatement: 'BlockStatement',
        BinaryExpression: 'BinaryExpression',
        BreakStatement: 'BreakStatement',
        CallExpression: 'CallExpression',
        CatchClause: 'CatchClause',
        ConditionalExpression: 'ConditionalExpression',
        ContinueStatement: 'ContinueStatement',
        DoWhileStatement: 'DoWhileStatement',
        DebuggerStatement: 'DebuggerStatement',
        EmptyStatement: 'EmptyStatement',
        ExpressionStatement: 'ExpressionStatement',
        ForStatement: 'ForStatement',
        ForInStatement: 'ForInStatement',
        FunctionDeclaration: 'FunctionDeclaration',
        FunctionExpression: 'FunctionExpression',
        Identifier: 'Identifier',
        IfStatement: 'IfStatement',
        Literal: 'Literal',
        LabeledStatement: 'LabeledStatement',
        LogicalExpression: 'LogicalExpression',
        MemberExpression: 'MemberExpression',
        NewExpression: 'NewExpression',
        ObjectExpression: 'ObjectExpression',
        Program: 'Program',
        Property: 'Property',
        ReturnStatement: 'ReturnStatement',
        SequenceExpression: 'SequenceExpression',
        SwitchStatement: 'SwitchStatement',
        SwitchCase: 'SwitchCase',
        ThisExpression: 'ThisExpression',
        ThrowStatement: 'ThrowStatement',
        TryStatement: 'TryStatement',
        UnaryExpression: 'UnaryExpression',
        UpdateExpression: 'UpdateExpression',
        VariableDeclaration: 'VariableDeclaration',
        VariableDeclarator: 'VariableDeclarator',
        WhileStatement: 'WhileStatement',
        WithStatement: 'WithStatement'
    },

    hasAnnotationDefinition = /^\s*\*\s*@/,

    stripLineStart = /^\s*\*\s*/,

    Documentation = inherit.Base.inherit({

        ctor: function () {

            this.documentations = {};
            this.excludeDocumentations = [];

            this.documentationProcessors = {
                js: new ClassDocumentationProcessor(),
                xml: new XamlClassDocumentationProcessor()
            };

        },

        addClassDocumentation: function (className, classDocumentation) {

            if (!className) {
                throw "className omitted";
            }

            if (!(classDocumentation instanceof ClassDocumentation)) {
                throw "not a ClassDocumentation";
            }

            var documentation = this.documentations[className];
            if (documentation) {
                var message = "overwrite documentation for class: " + className + ". FqClassname already used in " + documentation.file + "\n";

                console.error(message);

                throw new Error(message);
            }

            this.documentations[className] = classDocumentation;
        },

        excludeClassDocumentation: function(className) {
            this.excludeDocumentations.push(className);
        },

        generateDocumentationsForFile: function (type, code, defaultFqClassName, path, excludeFromOutput) {

            var processor = this.documentationProcessors[type];

            if (!processor) {
                throw 'Processor for type "' + type + '" not found.';
            }

            var docs = processor.generate(code, defaultFqClassName, path);

            docs.forEach(function (doc) {
                doc.file = path;
                doc.package = path.replace(/\/[^/]+$/, "").replace(/\//g, ".");
            });

            docs.forEach(function (doc) {
                this.addClassDocumentation(doc.fqClassName, doc);

                if (excludeFromOutput) {
                    this.excludeClassDocumentation(doc.fqClassName);
                }

            }, this);

            return docs;
        },

        process: function () {
            var fqClassName,
                classDocumentation;

            for (fqClassName in this.documentations) {
                if (this.documentations.hasOwnProperty(fqClassName)) {
                    classDocumentation = this.documentations[fqClassName];

                    if (classDocumentation.inherit && !classDocumentation.inheritancePath) {

                        if (classDocumentation.inherit === fqClassName) {
                            console.warn('Class ' + fqClassName + ' inherit from itself');
                        } else {
                            // build the inheritance path
                            classDocumentation.inheritancePath = classDocumentation.generateInheritancePath(this.documentations);
                        }
                    }

                    if (classDocumentation.inheritancePath) {
                        // find inherit methods
                        classDocumentation.addInheritMethods(this.documentations);

                        classDocumentation.extendInherit(this.documentations, "defaults");
                        classDocumentation.extendInherit(this.documentations, "properties");
                        classDocumentation.extendInherit(this.documentations, "events");

                    }
                }
            }

            // convert methods object into array
            for (fqClassName in this.documentations) {
                if (this.documentations.hasOwnProperty(fqClassName)) {

                    classDocumentation = this.documentations[fqClassName];

                    var i,
                        methodArray = [],
                        staticMethodArray = [],
                        methodNames = _.keys(classDocumentation.methods),
                        staticMethodNames = _.keys(classDocumentation.staticMethods || {}),
                        methodName, method;

                    methodNames.sort();
                    staticMethodNames.sort();

                    for (i = 0; i < methodNames.length; i++) {

                        methodName = methodNames[i];
                        method = classDocumentation.methods[methodName];
                        method.name = methodName;
                        method.visibility = (methodName.substr(0, 1) === '_' || method.hasOwnProperty('private')) && !method.hasOwnProperty('public') ? 'protected' : 'public';

                        methodArray.push(method);
                    }

                    for (i = 0; i < staticMethodNames.length; i++) {
                        methodName = staticMethodNames[i];
                        method = classDocumentation.staticMethods[methodName];
                        method.name = methodName;
                        method.visibility = (methodName.substr(0, 1) === '_' || method.hasOwnProperty('private')) && !method.hasOwnProperty('public') ? 'protected' : 'public';

                        staticMethodArray.push(method);
                    }

                    classDocumentation.methods = methodArray;
                    classDocumentation.staticMethods = staticMethodArray;

                }
            }


            return this.documentations;

        }
    }),

    ClassDocumentation = inherit({

        ctor: function (definition) {
            definition = definition || {};

            for (var key in definition) {
                if (definition.hasOwnProperty(key)) {
                    this[key] = definition[key];
                }
            }

            _.defaults(this, {
                methods: {},
                defaults: {}
            });
        },

        getParameterByNameForMethod: function (parameterName, methodName) {
            if (this.methods.hasOwnProperty(methodName)) {
                for (var i = 0; i < this.methods[methodName].parameter.length; i++) {
                    var parameter = this.methods[methodName].parameter[i];
                    if (parameter.name === parameterName) {
                        return parameter;
                    }
                }
            }

            return null;
        },

        generateInheritancePath: function (documentations) {

            var ret = [];

            if (this.inherit) {

                ret.push(this.inherit);

                var inheritFrom = documentations[this.inherit];
                if (inheritFrom) {
                    if (inheritFrom === this) {
                        console.warn('Inherits from itself');
                    } else {
                        ret = ret.concat(inheritFrom.generateInheritancePath(documentations));
                    }
                }
            }

            return ret;
        },

        addInheritMethods: function (documentations) {

            var nativeMethods = [],
                methodName;

            for (methodName in this.methods) {
                if (this.methods.hasOwnProperty(methodName)) {
                    nativeMethods.push(methodName);
                }
            }

            if (this.inheritancePath instanceof Array) {
                for (var i = 0; i < this.inheritancePath.length; i++) {
                    var baseClassFqClassName = this.inheritancePath[i];

                    if (documentations.hasOwnProperty(baseClassFqClassName)) {

                        var baseClass = documentations[baseClassFqClassName];

                        for (methodName in baseClass.methods) {
                            if (baseClass.methods.hasOwnProperty(methodName)) {

                                var currentMethod = null;

                                if (_.indexOf(nativeMethods, methodName) !== -1) {
                                    currentMethod = this.methods[methodName];
                                }

                                if (!currentMethod) {
                                    // inherit method
                                    currentMethod = this.methods[methodName] = _.clone(baseClass.methods[methodName]);
                                }

                                currentMethod.definedBy = baseClassFqClassName;

                                if (nativeMethods.indexOf(methodName) !== -1) {
                                    // overwrite methodName
                                    currentMethod.overwritesMethod = true;
                                }

                                for (var j = 0; j < currentMethod.parameter.length; j++) {
                                    var localParameter = currentMethod.parameter[j];

                                    if (Object.keys(localParameter).length === 1) {
                                        // only the name of the parameter defined -> extend parameter properties

                                        var inheritParameter = baseClass.getParameterByNameForMethod(localParameter.name, methodName);
                                        if (inheritParameter) {
                                            _.defaults(localParameter, inheritParameter);
                                        }
                                    }
                                }
                            }
                        }

                    }

                }
            }

        },

        extendInherit: function (documentations, field) {
            var own = [],
                property,
                scope = this[field] || {};

            for (property in scope) {
                if (scope.hasOwnProperty(property)) {
                    own.push(property);
                }
            }

            if (this.inheritancePath instanceof Array) {
                for (var i = 0; i < this.inheritancePath.length; i++) {
                    var baseClassFqClassName = this.inheritancePath[i];

                    if (documentations.hasOwnProperty(baseClassFqClassName)) {

                        var baseClass = documentations[baseClassFqClassName];

                        var baseScope = baseClass[field];
                        for (property in baseScope) {
                            if (baseScope.hasOwnProperty(property)) {

                                var currentDefault = null;

                                if (_.indexOf(own, property) !== -1) {
                                    currentDefault = scope[property];
                                }

                                if (!currentDefault) {
                                    // inherit method
                                    currentDefault = scope[property] = _.clone(baseScope[property]);
                                }

                                currentDefault.definedBy = baseClassFqClassName;

                                if (own.indexOf(property) !== -1) {
                                    // overwrite property
                                    currentDefault.overwrites = true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }),

    ClassDocumentationProcessor = inherit({

        ctor: function () {
            this.classAnnotationProcessors = [
                new Documentation.Processors.Class(),
                new Documentation.Processors.General('summary'),
                new Documentation.Processors.General('inherit'),
                new Documentation.Processors.General('see', true),
                new Documentation.Processors.General('ignore'),
                new Documentation.Processors.Description()
            ];

            this.prototypeAnnotationProcessors = [
                new Documentation.Processors.Parameter(),
                new Documentation.Processors.Return(),
                new Documentation.Processors.General('private'),
                new Documentation.Processors.General('public'),
                new Documentation.Processors.General('deprecated'),
                new Documentation.Processors.General('abstract'),
                new Documentation.Processors.General('ignore'),
                new Documentation.Processors.General('see', true),
                new Documentation.Processors.Description()
            ];

            this.propertyAnnotationProcessors = [
                new Documentation.Processors.General('policy'),
                new Documentation.Processors.General('ignore'),
                new Documentation.Processors.General('deprecated'),
                new Documentation.Processors.Type(),
                new Documentation.Processors.Description()
            ];


            this.defaultAnnotationProcessors = [
                new Documentation.Processors.General('see', true),
                new Documentation.Processors.General('ignore'),
                new Documentation.Processors.General('deprecated'),
                new Documentation.Processors.General('required'),
                new Documentation.Processors.Type(),
                new Documentation.Processors.Description()
            ];

            this.eventAnnotationProcessors = [
                new Documentation.Processors.General('see', true),
                new Documentation.Processors.General('ignore'),
                new Documentation.Processors.General('deprecated'),
                new Documentation.Processors.Type(),
                new Documentation.Processors.Description()
            ];

            this.methodAnnotationProcessors = {
                onChange: new Documentation.Processors.ArrayMethodAnnotationProcessor("onChange"),
                on: new Documentation.Processors.OnMethodAnnotationProcessor(),
                bus: new Documentation.Processors.ArrayMethodAnnotationProcessor("bus"),
                async: new Documentation.Processors.ArrayMethodAnnotationProcessor("async}")
            };
        },

        generate: function (code, fqClassName, path) {

            var ast = this.ast = esprima.parse(code, {
                    comment: true,
                    range: true
                }),
                ret = [];

            this.code = code;
            this.filePath = path;

            // search for all define statements in file
            for (var i = 0; i < ast.body.length; i++) {
                var body = ast.body[i],
                    expression = body.expression;

                if (body.type === CONST.ExpressionStatement &&
                    expression.type === CONST.CallExpression &&
                    expression.callee.name === 'define') {

                    // we found an define expression
                    if (expression.arguments.length >= 2 &&
                        expression.arguments[0].type === CONST.ArrayExpression &&
                        expression.arguments[1].type === CONST.FunctionExpression) {
                        // that's how a amd works -> extract the class definition

                        var varToRequireMap = {},
                            dependencies = [];

                        for (var j = 0; j < expression.arguments[1].params.length; j++) {
                            varToRequireMap[expression.arguments[1].params[j].name] = expression.arguments[0].elements[j].value;
                            dependencies.push((expression.arguments[0].elements[j].value || "").replace(/\//g, "."));
                        }

                        var classDocumentations = this.getClassDocumentations(expression.arguments[1].body, varToRequireMap),
                            start = body.range[0];
                        for (var c = 0; c < classDocumentations.length; c++) {

                            var classDocumentation = classDocumentations[c];

                            if (classDocumentation) {

                                dependencies.sort();
                                classDocumentation.dependencies = dependencies;

                                // get annotations for class from body begin until class definition begin
                                var annotations = this.getAnnotationInRange(start, classDocumentation.start, this.classAnnotationProcessors);
                                start = classDocumentation.end;

                                for (var a = 0; a < annotations.length; a++) {
                                    var annotation = annotations[a];
                                    annotation.processor.mapAnnotationToItem(annotation, classDocumentation, annotations);
                                }

                                delete classDocumentation.start;
                                delete classDocumentation.end;

                                classDocumentation.fqClassName = classDocumentation.fqClassName || fqClassName;
                                classDocumentation.type = "js";

                                if (!classDocumentation.hasOwnProperty(('ignore'))) {
                                    ret.push(new ClassDocumentation(classDocumentation));
                                }
                            }
                        }

                    }
                }
            }

            return ret;

        },

        getClassDocumentations: function (functionBody, varToRequireMap) {

            var ret = [],
                mainClassDocumentation = null;

            for (var i = 0; i < functionBody.body.length; i++) {
                var statement = functionBody.body[i],
                    argument = statement.argument,
                    classDocumentation = null;

                if (statement.type === CONST.ReturnStatement) {


                    if (argument.type === CONST.CallExpression) {
                        // class definition should use inherit.js

                        classDocumentation = this.getDocumentationFromInheritCall(argument, varToRequireMap, functionBody);
                        classDocumentation.start = argument.range[0];
                        classDocumentation.end = argument.range[1];

                        ret.push(classDocumentation);

                    } else if (argument.type === CONST.Identifier) {

                        var varName = argument.name;
                        // search for inherit assignment to varName
                        // either in variable declaration

                        for (var j = 0; j < functionBody.body.length; j++) {
                            statement = functionBody.body[j];

                            if (statement.type === CONST.VariableDeclaration) {
                                for (var k = 0; k < statement.declarations.length; k++) {
                                    var declaration = statement.declarations[k];

                                    if (declaration.type === CONST.VariableDeclarator &&
                                        declaration.id.type === CONST.Identifier && declaration.id.name === varName) {
                                        // found the variable declaration

                                        var value = declaration.init;

                                        if (!value) {
                                            // assignment happens later -> search for assignment
                                            for (var l = 0; l < functionBody.body.length; l++) {
                                                var innerStatement = functionBody.body[l];

                                                if (innerStatement.type === CONST.ExpressionStatement &&
                                                    innerStatement.expression.type === CONST.AssignmentExpression &&
                                                    innerStatement.expression.operator === "=" &&
                                                    innerStatement.expression.left.type === CONST.Identifier &&
                                                    innerStatement.expression.left.name === varName) {

                                                    // found the variable assignment
                                                    value = innerStatement.expression.right;
                                                    break;
                                                }
                                            }
                                        }

                                        mainClassDocumentation = classDocumentation = this.getDocumentationFromInheritCall(value, varToRequireMap, functionBody);

                                        if (classDocumentation) {
                                            classDocumentation.start = declaration.range[0];
                                            classDocumentation.end = declaration.range[1];

                                            ret.push(classDocumentation);
                                        }
                                    }

                                }
                            } else if (mainClassDocumentation &&
                                statement.type === CONST.ExpressionStatement &&
                                statement.expression.type === CONST.AssignmentExpression &&
                                statement.expression.operator === "=" && statement.expression.left.type === CONST.MemberExpression &&
                                statement.expression.left.object.name === varName) {

                                if (statement.expression.right.type === CONST.CallExpression) {

                                    classDocumentation = this.getDocumentationFromInheritCall(statement.expression.right, varToRequireMap, functionBody);

                                    if (classDocumentation) {
                                        classDocumentation.start = statement.range[0];
                                        classDocumentation.end = statement.range[1];

                                        classDocumentation.fqClassName = classDocumentation.fqClassName || (mainClassDocumentation.fqClassName ? mainClassDocumentation.fqClassName + "." + statement.expression.left.property.name : null);

                                        if (!classDocumentation.inherit && statement.expression.right.callee.type === CONST.MemberExpression &&
                                            statement.expression.right.callee.object.name === varName) {

                                            classDocumentation.inherit = mainClassDocumentation.fqClassName;

                                        }

                                        mainClassDocumentation.exports = mainClassDocumentation.exports || {};

                                        mainClassDocumentation.exports[statement.expression.left.property.name] = {
                                            type: "InnerClass",
                                            fqClassName: classDocumentation.fqClassName
                                        };

                                        ret.push(classDocumentation);

                                    }

                                }


                            }

                        }

                    }

                }
            }

            return ret;

        },

        getDocumentationFromInheritCall: function (argument, varToRequireMap, scope) {
            if ((argument.callee.type === CONST.MemberExpression && argument.callee.property.type === CONST.Identifier && argument.callee.property.name === 'inherit') ||
            (argument.callee.type === CONST.Identifier && argument.callee.name === "inherit")) {
                // we found the inherit

                var classDocumentation = this.getClassDocumentationFromInherit(argument.arguments, scope);

                if (classDocumentation) {
                    var inheritFromName = argument.callee.object ? argument.callee.object.name : null;

                    if (inheritFromName && varToRequireMap.hasOwnProperty(inheritFromName)) {
                        classDocumentation.inherit = classDocumentation.inherit || this.getFqClassNameFromPath(varToRequireMap[inheritFromName]);
                    }
                }

                return classDocumentation;
            }

            return null;
        },

        getClassDocumentationFromInherit: function (fnArguments, scope) {

            var fqClassName,
                argument,
                documentation,
                staticArgument;

            if (!(fnArguments && fnArguments.length)) {
                // no fnArguments passed
                return;
            }

            argument = fnArguments.shift();

            if (argument.type === CONST.Literal) {
                // we found the fqClassName
                fqClassName = argument.value;
                argument = fnArguments.shift();
            }

            staticArgument = fnArguments.shift();


            if (argument && argument.type === CONST.ObjectExpression) {
                // we found the prototype definition
                documentation = this.getDocumentationFromObject(argument, staticArgument);
            } else if (argument && argument.type === CONST.CallExpression &&
                argument.callee.object.name === "_" && argument.callee.property.name === "extend") {

                // inherit from extended objections
                var extendedProperties = {},
                    object = {
                        type: CONST.ObjectExpression,
                        properties: [],
                        range: [
                            0, 0
                        ]
                    },
                    firstExtend = true;

                for (var i = 0; i < argument.arguments.length; i++) {
                    var extendObject = argument.arguments[i];

                    if (extendObject.type === CONST.Identifier) {

                        var varName = extendObject.name;

                        // search for the Object
                        for (var j = 0; j < scope.body.length; j++) {
                            var statement = scope.body[j];

                            if (statement.type === CONST.VariableDeclaration) {

                                for (var k = 0; k < statement.declarations.length; k++) {
                                    var declaration = statement.declarations[k];

                                    if (declaration.type === CONST.VariableDeclarator && declaration.id.name === varName
                                        && declaration.init.type === CONST.ObjectExpression) {
                                        // found the var -> go through the properties

                                        if (firstExtend) {
                                            object.range = declaration.init.range;
                                            firstExtend = false;
                                        } else {
                                            object.range[1] = declaration.init.range[1];
                                        }

                                        for (var l = 0; l < declaration.init.properties.length; l++) {
                                            var property = declaration.init.properties[l];

                                            extendedProperties[property.key.name] = property;
                                        }
                                    }
                                }

                            }
                        }
                    }
                }


                for (var key in extendedProperties) {
                    if (extendedProperties.hasOwnProperty(key)) {
                        object.properties.push(extendedProperties[key]);
                    }
                }

                documentation = this.getDocumentationFromObject(object);

            }

            if (documentation) {
                documentation.fqClassName = fqClassName;
                return documentation;
            }
        },

        getDocumentationFromObject: function (object, staticObject) {

            var documentation = {
                    methods: {},
                    staticMethods: {},
                    defaults: {},
                    properties: {}
                },
                file = this.filePath,
                properties = object.properties,
                lastProperty,
                property,
                item, paramMap,
                annotationFrom,
                annotationTo,
                annotations,
                annotationMethods,
                self = this,
                i, result,
                methods = "methods",
                staticMethods = "staticMethods";

            for (i = 0; i < properties.length; i++) {
                lastProperty = properties[i - 1];
                property = properties[i];
                item = null;
                paramMap = {};
                annotations = null;
                annotationMethods = [];

                annotationFrom = lastProperty ? lastProperty.range[1] : object.range[0];
                annotationTo = property.range[0];

                if (property.value.type === CONST.CallExpression) {

                    result = getMethodDefinitionWithAnnotations(property.value);
                    parseMethodDocumentation(property.key.name, result.method, result.annotations, methods);

                } else if (property.value.type === CONST.FunctionExpression) {
                    parseMethodDocumentation(property.key.name, property.value, null, methods);
                } else if (property.key.type === CONST.Identifier && property.key.name === "defaults" && property.value.type === CONST.ObjectExpression) {
                    // found the defaults block

                    documentation.defaults = this.getDefaultValues(property.value);

                } else if (property.key.type === CONST.Identifier && property.key.name === "events" && property.value.type === CONST.ArrayExpression) {

                    documentation.events = this.getEvents(property.value);

                } else if (property.key.type === CONST.Identifier && property.key.name === "schema" && property.value.type === CONST.ObjectExpression) {
                    // TODO: read schema
                } else if (property.key.type === CONST.Identifier && property.key.name === "inject" && property.value.type === CONST.ObjectExpression) {
                    // TODO: read injection
                } else if (property.key.type === CONST.Identifier) {
                    annotations = this.getAnnotationInRange(annotationFrom, annotationTo, this.propertyAnnotationProcessors);
                    documentation.properties[property.key.name] = this.getPropertyDocumentation(property, annotations);
                }

            }

            if (staticObject) {
                properties = staticObject.properties;

                for (i = 0; i < properties.length; i++) {
                    lastProperty = properties[i - 1];
                    property = properties[i];
                    item = null;
                    paramMap = {};
                    annotations = null;
                    annotationMethods = [];

                    annotationFrom = lastProperty ? lastProperty.range[1] : staticObject.range[0];
                    annotationTo = property.range[0];


                    if (property.value.type === CONST.CallExpression) {
                        result = getMethodDefinitionWithAnnotations(property.value);
                        parseMethodDocumentation(property.key.name, result.method, result.annotations, staticMethods);
                    } else if (property.value.type === CONST.FunctionExpression) {
                        parseMethodDocumentation(property.key.name, property.value, null, staticMethods);
                    }
                }
            }

            return documentation;

            function parseMethodDocumentation(name, value, methodAnnotations, target) {

                item = {
                    type: 'Method',
                    parameter: [],
                    annotations: {},
                    definedInFile: file,
                    lineNumbers: [self.getLineNumber(value.range[0]), self.getLineNumber(value.range[1])]
                };

                for (var j = 0; j < value.params.length; j++) {
                    var param = {
                        name: value.params[j].name
                    };

                    paramMap[value.params[j].name] = param;
                    item.parameter.push(param)
                }

                annotations = self.getAnnotationInRange(annotationFrom, annotationTo, self.prototypeAnnotationProcessors);

                for (var a = 0; a < annotations.length; a++) {
                    var annotation = annotations[a];
                    annotation.processor.mapAnnotationToItem(annotation, item, annotations);
                }

                if (methodAnnotations) {
                    for (var i = 0; i < methodAnnotations.length; i++) {
                        var methodAnnotation = methodAnnotations[i],
                            annotationName = methodAnnotation.name,
                            methodAnnotationProcessor = self.methodAnnotationProcessors[annotationName];

                        if (methodAnnotationProcessor) {

                            var annotationItem = item.annotations[annotationName] = item.annotations[annotationName] || [];
                            methodAnnotationProcessor.parse(methodAnnotation, annotationItem);

                        } else {
                            console.warn("No MethodAnnotationProcessor for " + annotationName + " found.");
                        }
                    }
                }

                if (!item.hasOwnProperty('ignore')) {
                    documentation[target][name] = item;
                }

            }

            function getMethodDefinitionWithAnnotations(object) {

                var annotations = [
                        {
                            name: object.callee.property.name,
                            arguments: object.arguments
                        }
                    ],
                    method;

                if (object.callee.object.type === CONST.CallExpression) {
                    // another method annotation
                    var sub = getMethodDefinitionWithAnnotations(object.callee.object);

                    method = sub.method;
                    annotations = annotations.concat(sub.annotations);

                } else if (object.callee.object.type === CONST.FunctionExpression) {
                    // we found the method
                    method = object.callee.object;
                }

                return {
                    annotations: annotations,
                    method: method
                }

            }

        },

        getVisibility: function (name) {
            return /^[$_]/.test(name) ? "private" : "public";
        },

        getPropertyDocumentation: function (property, annotations) {

            var name = property.key.name,
                ret = {
                    name: name,
                    visibility: this.getVisibility(name),
                    definedInFile: this.filePath,
                    lineNumbers: [this.getLineNumber(property.range[0]), this.getLineNumber(property.range[1])]
                };

            if (property.value.type === CONST.Literal) {
                ret.value = property.value.raw;
                ret.propertyType = "value";
            } else {
                ret.propertyType = "complex";
                ret.value = this.code.substring(property.range[0] + name.length + 1, property.range[1]);
            }

            for (var a = 0; a < annotations.length; a++) {
                var annotation = annotations[a];
                annotation.processor.mapAnnotationToItem(annotation, ret, annotations);
            }

            return ret;
        },

        getDefaultValues: function (defaultsObject) {

            var defaults = defaultsObject.properties,
                ret = {},
                lastDefaultEntry,
                file = this.file;

            for (var i = 0; i < defaults.length; i++) {
                var defaultEntry = defaults[i],
                    defaultName,
                    isValueDefault = defaultEntry.value.type === CONST.Literal;

                if (defaultEntry.key.type === CONST.Identifier) {
                    defaultName = defaultEntry.key.name
                } else if (defaultEntry.key.type === CONST.Literal) {
                    defaultName = defaultEntry.key.value;
                } else {
                    console.warn("couldn't determinate the name for the default");
                }

                lastDefaultEntry = defaults[i - 1];

                var item = {
                    name: defaultName,
                    defaultType: isValueDefault ? "value" : "factory",
                    visibility: this.getVisibility(defaultName),
                    value: isValueDefault ? defaultEntry.value.value : undefined,
                    definedInFile: file,
                    lineNumbers: [this.getLineNumber(defaultEntry.range[0]), this.getLineNumber(defaultEntry.range[1])]
                };

                var annotations = this.getAnnotationInRange(lastDefaultEntry ? lastDefaultEntry.range[1] : defaultsObject.range[0], defaultEntry.range[0], this.defaultAnnotationProcessors);

                for (var a = 0; a < annotations.length; a++) {
                    var annotation = annotations[a];
                    annotation.processor.mapAnnotationToItem(annotation, item, annotations);
                }

                if (!item.hasOwnProperty('ignore')) {
                    ret[defaultName] = item;
                }

            }

            return ret;

        },

        getEvents: function (eventsObject) {

            var events = eventsObject.elements,
                ret = {},
                lastEventName;

            for (var i = 0; i < events.length; i++) {
                var eventEntry = events[i],
                    eventName = eventEntry.value;

                eventName = eventName.replace(/^on:/, "");

                lastEventName = events[i - 1];

                var item = {
                    type: "Event",
                    name: eventName,
                    visibility: this.getVisibility(eventName),
                    definedInFile: this.file,
                    lineNumbers: [this.getLineNumber(eventEntry.range[0]), this.getLineNumber(eventEntry.range[1])]
                };

                var annotations = this.getAnnotationInRange(lastEventName ? lastEventName.range[1] : eventsObject.range[0], eventEntry.range[0], this.eventAnnotationProcessors);

                for (var a = 0; a < annotations.length; a++) {
                    var annotation = annotations[a];
                    annotation.processor.mapAnnotationToItem(annotation, item, annotations);
                }

                if (!item.hasOwnProperty('ignore')) {
                    ret[eventName] = item;
                }

            }

            return ret;

        },

        getLineNumber: function(position) {
            return this.code.substring(0, position).split("\n").length;
        },

        getAnnotationInRange: function (from, to, processors) {
            var comments = this.getCommentsInRange(from, to),
                ret = [],
                lines = [];

            for (var i = 0; i < comments.length; i++) {
                var comment = comments[i];

                if (comment.type === 'Block') {
                    lines = comment.value.split(/\n/g);
                    lines.shift();
                    lines.pop();
                } else {
                    lines.push(comment.value);

                    if (comments[i + 1] && comments[i + 1].type === 'Line') {
                        // add next lines
                        continue;
                    }
                }

                var lastAnnotationProcessor = null,
                    lastResult = null;

                for (var j = 0; j < lines.length; j++) {
                    var line = lines[j],
                        lineProcessed = false;


                    if (lastAnnotationProcessor && !hasAnnotationDefinition.test(line)) {
                        // no @ found -> use last annotation type
                        lastAnnotationProcessor.appendToResult(lastResult, line.replace(stripLineStart, ''));
                        lineProcessed = true;
                    } else {
                        for (var k = 0; k < processors.length; k++) {

                            var annotationProcessor = processors[k];
                            var result = annotationProcessor.parse(line);

                            if (result) {
                                lastResult = result;
                                lastAnnotationProcessor = annotationProcessor;
                                lineProcessed = true;
                                ret.push(result);

                                // do not process with other processors
                                break;
                            }
                        }
                    }

                    if (!lineProcessed) {
                        console.warn("Did not processed line '" + line + "'.");
                    }
                }

                lines = [];

            }

            return ret;

        },

        getCommentsInRange: function (from, to) {
            var ret = [];

            for (var i = 0; i < this.ast.comments.length; i++) {
                var comment = this.ast.comments[i];
                if (comment.range[0] >= from && comment.range[1] <= to) {
                    ret.push(comment);
                }
            }

            return ret;
        },

        getFqClassNameFromPath: function (name) {
            // TODO: check if some paths are mapped
            // stripe plugin and change / to .
            return name.replace(/^[a-z/]+!]/, '').replace(/\//g, '.').replace("xaml!", "");
        }
    }),

    XamlClassDocumentationProcessor = inherit({

        getVisibility: function (name) {
            return /^[$_]/.test(name) ? "private" : "public";
        },

        generate: function (code, fqClassName, path) {

            var xml = this.xml = new DomParser().parseFromString(code, "text/xml").documentElement,
                definition = {
                    fqClassName: fqClassName,
                    // TODO: load xaml plugin and reuse find dependencies method
                    dependencies: [],
                    type: "xml"
                };

            // TODO: keep track of rewrite map
            definition.inherit = xml.namespaceURI + "." + xml.localName;

            definition.dependencies.push(definition.inherit);

            var defaults = {};

            for (var i = 0; i < xml.attributes.length; i++) {
                var attribute = xml.attributes[i],
                    defaultName = attribute.localName;

                if (!attribute.namespaceURI && !/^xml/.test(attribute.localName)) {

                    defaults[defaultName] = {
                        name: defaultName,
                        defaultType: "value",
                        visibility: this.getVisibility(defaultName),
                        value: attribute.value
                    };

                }

            }

            definition.defaults = defaults;


            return [
                new ClassDocumentation(definition)
            ];

        }
    });


Documentation.AnnotationProcessor = inherit.Base.inherit({

    parse: function (line) {
    },

    mapAnnotationToItem: function (annotation, item, annotations) {
    }

});

Documentation.MethodAnnotionProcessor = inherit.Base.inherit({
    parse: function(annotation, methodAnnotionObject) {
    }
});

Documentation.Processors = {};

Documentation.Processors.General = Documentation.AnnotationProcessor.inherit("Documentation.Processor.General", {

    ctor: function (type, many) {
        this.type = type;
        this.many = many;
    },

    parse: function (line) {

        var result = Documentation.Processors.General.Parser.exec(line),
            self = this;

        if (result && result[1] === this.type) {

            return {
                type: this.type,
                processor: self,
                value: result[2]
            }
        }
    },

    appendToResult: function (result, description) {
        result.value += description;
    },

    mapAnnotationToItem: function (annotation, item, annotations) {
        if (this.many) {
            item[this.type] = item[this.type] || [];
            item[this.type].push(annotation.value);
        } else {
            item[this.type] = annotation.value;
        }
    }
}, {
    Parser: /^\s*\*\s*@(\S+):?\s*([\s\S]*)\s*$/
});


Documentation.Processors.Class = Documentation.AnnotationProcessor.inherit("Documentation.Processors.Class", {
    parse: function (line) {

        var result = Documentation.Processors.Class.Parser.exec(line);

        if (result) {

            result.shift();

            return {
                type: 'fqClassName',
                processor: this,
                value: result[0]
            }
        }
    },

    appendToResult: function (result, description) {
        return false;
    },

    mapAnnotationToItem: function (annotation, item, annotations) {
        item.fqClassName = annotation.value;
    }
}, {
    Parser: /^\s*\*\s*@class:?\s*(\S+)\s*$/
});

Documentation.Processors.Parameter = Documentation.AnnotationProcessor.inherit("Documentation.Processors.Parameter", {
    parse: function (line) {

        var result = Documentation.Processors.Parameter.Parser.exec(line);

        if (result) {

            result.shift();

            return {
                type: 'parameter',
                processor: this,
                value: {
                    types: result[0] ? result[0].split('|') : null,
                    name: result[1] || result[2],
                    optional: !!result[2],
                    defaultValue: result[3],
                    description: result[4]
                }
            }
        }
    },

    appendToResult: function (result, description) {
        result.value.description += description;

        if (!/\\\s*$/.test(description)) {
            result.value.description += "\n";
        }

    },

    mapAnnotationToItem: function (annotation, item, annotations) {
        item.parameter = item.parameter || [];

        for (var i = 0; i < item.parameter.length; i++) {
            var parameter = item.parameter[i];

            if (parameter.name === annotation.value.name) {
                item.parameter[i] = annotation.value;
                return;
            }
        }

        console.warn('Could find parameter for annotation ' + annotation.value.name);

    }
}, {
    Parser: /\*\s{0,4}@param:?\s+?(?:\{(.+)?\})?\s*(?:([^[ ]+)|(?:\[([^=]+)(?:=(.*)?)?\]))\s*-?\s*(.+)?$/
});

Documentation.Processors.Type = Documentation.AnnotationProcessor.inherit("Documentation.Processors.Type", {
    parse: function (line) {

        var result = Documentation.Processors.Type.Parser.exec(line);

        if (result) {

            result.shift();

            return {
                type: 'type',
                processor: this,
                value: {
                    types: result[0] ? result[0].split('|') : null
                }
            }
        }
    },

    appendToResult: function () {
    },

    mapAnnotationToItem: function (annotation, item, annotations) {
        item.types = item.types || [];

        for (var i = 0; i < annotation.value.types.length; i++) {
            var type = annotation.value.types[i];
            if (_.indexOf(item.types, type) === -1) {
                item.types.push(type);
            }
        }

    }
}, {
    Parser: /\*\s{0,4}@type:?\s+?\{?([^}]+)?\}?\s*?$/
});

Documentation.Processors.Return = Documentation.AnnotationProcessor.inherit("Documentation.Processors.Return", {
    parse: function (line) {
        var result = Documentation.Processors.Return.Parser.exec(line);

        if (result) {

            result.shift();

            return {
                type: 'return',
                processor: this,
                value: {
                    types: result[0] ? result[0].split('|') : null,
                    description: result[1]
                }
            }
        }
    },

    appendToResult: function (result, description) {
        result.value.description += description;
    },

    mapAnnotationToItem: function (annotation, item, annotations) {
        item.returns = annotation.value;
    }
}, {
    Parser: /\*\s{0,4}@return[s]?:?\s+?(?:\{(.+)?\})?\s*-?\s*(.+)?$/
});

Documentation.Processors.Description = Documentation.AnnotationProcessor.inherit("Documentation.Processors.Description", {
    parse: function (line) {

        var result = Documentation.Processors.Description.Parser.exec(line);

        if (result) {

            result.shift();

            return {
                type: 'description',
                processor: this,
                value: {
                    description: result[0]
                }
            }
        } else if (!hasAnnotationDefinition.test(line)) {
            // line without annotation -> it's a description
            return {
                type: 'description',
                processor: this,
                value: {
                    description: line.replace(stripLineStart, '')
                }
            }
        }
    },

    appendToResult: function (result, description) {
        result.value.description += "\n" + description;
    },

    mapAnnotationToItem: function (annotation, item) {
        item.description = annotation.value.description;
    }
}, {
    Parser: /\*\s*@description\s*(.+)$/
});

Documentation.Processors.ArrayMethodAnnotationProcessor = Documentation.MethodAnnotionProcessor.inherit("Documentation.Processors.ArrayMethodAnnotationProcessor", {

    ctor: function(name) {
        this.name = name;
    },

    parse: function (annotation, methodAnnotationObject) {

        for (var i = 0; i < annotation.arguments.length; i++) {
            methodAnnotationObject.push(annotation.arguments[i].value);
        }

    }
});

Documentation.Processors.OnMethodAnnotationProcessor = Documentation.MethodAnnotionProcessor.inherit("Documentation.Processors.OnMethodAnnotationProcessor", {
    parse: function (annotation, methodAnnotationObject) {

        for (var i = 0; i < annotation.arguments.length; i++) {
            var arg = annotation.arguments[i];

            if (arg.type === CONST.Literal) {
                methodAnnotationObject.push(["this", arg.value]);
            } else if (arg.type === CONST.ArrayExpression) {
                methodAnnotationObject.push([arg.elements[0].value, arg.elements[1].value]);
            }
        }

    }
});


exports.version = '0.1.0';
exports.Documentation = Documentation;
