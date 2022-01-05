/*********************************************************************************
 * Copyright (c) 2021-2022 STMicroelectronics and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * https://www.eclipse.org/legal/epl-2.0, or the MIT License which is
 * available at https://opensource.org/licenses/MIT.
 *
 * SPDX-License-Identifier: EPL-2.0 OR MIT
 *********************************************************************************/
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import WebSocket from 'isomorphic-ws';

import {
    ModelServerClientApiV1,
    ModelServerError,
    ServerConfiguration,
    SubscriptionOptions
} from './model-server-client-api-v1';
import { MessageDataMapper, Model, ModelServerMessage } from './model-server-message';
import { ModelServerPaths } from './model-server-paths';
import { ModelServerCommand } from './model/command-model';
import { Diagnostic } from './model/diagnostic';
import { SubscriptionListener } from './subscription-listener';
import { AnyObject, asObject, asString, asType, TypeGuard } from './utils/type-util';

/**
 * A client to interact with a model server.
 */
export class ModelServerClient implements ModelServerClientApiV1 {
    protected restClient: AxiosInstance;
    protected openSockets: Map<string, WebSocket> = new Map();
    protected _baseUrl: string;
    protected defaultFormat = 'json';

    initialize(baseUrl: string): void | Promise<void> {
        this._baseUrl = baseUrl;
        this.restClient = axios.create(this.getAxisConfig(baseUrl));
    }

    protected getAxisConfig(baseURL: string): AxiosRequestConfig | undefined {
        return { baseURL };
    }

    get(modeluri: string, format?: string): Promise<AnyObject>;
    get<M>(modeluri: string, typeGuard: TypeGuard<M>, format?: string): Promise<M>;
    get<M>(modeluri: string, formatOrGuard?: FormatOrGuard<M>, format?: string): Promise<AnyObject | M> {
        if (typeof formatOrGuard === 'function') {
            const typeGuard = formatOrGuard;
            return this.process(this.restClient.get(ModelServerPaths.MODEL_CRUD, { params: { modeluri, format } }), msg =>
                MessageDataMapper.as(msg, typeGuard)
            );
        }
        format = formatOrGuard;
        return this.process(this.restClient.get(ModelServerPaths.MODEL_CRUD, { params: { modeluri, format } }), MessageDataMapper.asObject);
    }

    getAll(): Promise<Model[]>;
    getAll<M>(typeGuard: TypeGuard<M>): Promise<Model<M>[]>;
    getAll(format: string): Promise<Model<string>[]>;
    getAll<M>(formatOrGuard?: FormatOrGuard<M>): Promise<Array<Model | Model<string> | Model<M>>> {
        let modelMapper: (model: Model) => Model<string | AnyObject | M>;
        let format = 'json';
        if (!formatOrGuard) {
            modelMapper = (model: Model) => mapModel(model);
        } else if (typeof formatOrGuard === 'string') {
            format = formatOrGuard;
            modelMapper = (model: Model) => mapModel(model, undefined, true);
        } else {
            modelMapper = (model: Model) => mapModel(model, formatOrGuard);
        }
        const messageMapper = (message: ModelServerMessage): Array<Model | Model<string> | Model<M>> =>
            MessageDataMapper.asModelArray(message).map(modelMapper);

        return this.process(this.restClient.get(ModelServerPaths.MODEL_CRUD, { params: { format } }), messageMapper);
    }

    getModelUris(): Promise<string[]> {
        return this.process(this.restClient.get(ModelServerPaths.MODEL_URIS), MessageDataMapper.asStringArray);
    }

    getElementById(modeluri: string, elementid: string, format?: string): Promise<AnyObject>;
    getElementById<M>(modeluri: string, elementid: string, typeGuard: TypeGuard<M>): Promise<M>;
    getElementById<M>(modeluri: string, elementid: string, formatOrGuard?: FormatOrGuard<M>, format?: string): Promise<AnyObject | M> {
        format = format ?? 'json';
        if (formatOrGuard) {
            if (typeof formatOrGuard === 'function') {
                const typeGuard = formatOrGuard;
                return this.process(this.restClient.get(ModelServerPaths.MODEL_ELEMENT, { params: { modeluri, elementid, format } }), msg =>
                    MessageDataMapper.as(msg, typeGuard)
                );
            }
            format = formatOrGuard;
        }
        return this.process(
            this.restClient.get(ModelServerPaths.MODEL_ELEMENT, { params: { modeluri, elementid, format } }),
            MessageDataMapper.asObject
        );
    }

    getElementByName(modeluri: string, elementname: string, format?: string): Promise<AnyObject>;
    getElementByName<M>(modeluri: string, elementname: string, typeGuard: TypeGuard<M>, format?: string): Promise<M>;
    getElementByName<M>(modeluri: string, elementname: string, formatOrGuard?: FormatOrGuard<M>, format?: string): Promise<AnyObject | M> {
        format = format ?? 'json';
        if (formatOrGuard) {
            if (typeof formatOrGuard === 'function') {
                const typeGuard = formatOrGuard;
                return this.process(
                    this.restClient.get(ModelServerPaths.MODEL_ELEMENT, { params: { modeluri, elementname, format } }),
                    msg => MessageDataMapper.as(msg, typeGuard)
                );
            }
            format = formatOrGuard;
        }
        return this.process(
            this.restClient.get(ModelServerPaths.MODEL_ELEMENT, { params: { modeluri, elementname, format } }),
            MessageDataMapper.asObject
        );
    }

    create(modeluri: string, model: AnyObject | string, format?: string): Promise<AnyObject>;
    create<M>(modeluri: string, model: AnyObject | string, typeGuard: TypeGuard<M>, format?: string): Promise<M>;
    create<M>(modeluri: string, model: AnyObject | string, formatOrGuard?: FormatOrGuard<M>, format?: string): Promise<AnyObject | M> {
        format = format ?? 'json';
        if (formatOrGuard) {
            if (typeof formatOrGuard === 'function') {
                const typeGuard = formatOrGuard;
                return this.process(
                    this.restClient.post(ModelServerPaths.MODEL_CRUD, { data: model }, { params: { modeluri, format } }),
                    msg => MessageDataMapper.as(msg, typeGuard)
                );
            }
            format = formatOrGuard;
        }
        return this.process(
            this.restClient.post(ModelServerPaths.MODEL_CRUD, { data: model }, { params: { modeluri, format } }),
            MessageDataMapper.asObject
        );
    }

    update(modeluri: string, model: AnyObject | string, format?: string): Promise<AnyObject>;
    update<M>(modeluri: string, model: string | string, typeGuard: TypeGuard<M>, format?: string): Promise<M>;
    update<M>(
        modeluri: string,
        model: AnyObject | string,
        formatOrGuard?: FormatOrGuard<M>,
        format?: string
    ): Promise<AnyObject> | Promise<M> {
        format = format ?? 'json';
        if (formatOrGuard) {
            if (typeof formatOrGuard === 'function') {
                const typeGuard = formatOrGuard;
                return this.process(
                    this.restClient.patch(ModelServerPaths.MODEL_CRUD, { data: model }, { params: { modeluri, format } }),
                    msg => MessageDataMapper.as(msg, typeGuard)
                );
            }
            format = formatOrGuard;
        }
        return this.process(
            this.restClient.patch(ModelServerPaths.MODEL_CRUD, { data: model }, { params: { modeluri, format } }),
            MessageDataMapper.asObject
        );
    }

    delete(modeluri: string): Promise<boolean> {
        return this.process(this.restClient.delete(ModelServerPaths.MODEL_CRUD, { params: { modeluri } }), MessageDataMapper.isSuccess);
    }

    close(modeluri: string): Promise<boolean> {
        return this.process(this.restClient.post(ModelServerPaths.CLOSE, undefined, { params: { modeluri } }), MessageDataMapper.isSuccess);
    }

    save(modeluri: string): Promise<boolean> {
        return this.process(this.restClient.get(ModelServerPaths.SAVE, { params: { modeluri } }), MessageDataMapper.isSuccess);
    }

    saveAll(): Promise<boolean> {
        return this.process(this.restClient.get(ModelServerPaths.SAVE_ALL), MessageDataMapper.isSuccess);
    }

    validate(modeluri: string): Promise<Diagnostic> {
        return this.process(this.restClient.get(ModelServerPaths.VALIDATION, { params: { modeluri } }), response =>
            MessageDataMapper.as(response, Diagnostic.is)
        );
    }

    getValidationConstraints(modeluri: string): Promise<string> {
        return this.process(
            this.restClient.get(ModelServerPaths.VALIDATION_CONSTRAINTS, { params: { modeluri } }),
            MessageDataMapper.asString
        );
    }

    getTypeSchema(modeluri: string): Promise<string> {
        return this.process(this.restClient.get(ModelServerPaths.TYPE_SCHEMA, { params: { modeluri } }), MessageDataMapper.asString);
    }

    getUiSchema(schemaname: string): Promise<string> {
        return this.process(this.restClient.get(ModelServerPaths.UI_SCHEMA, { params: { schemaname } }), MessageDataMapper.asString);
    }

    configureServer(configuration: ServerConfiguration): Promise<boolean> {
        let { workspaceRoot, uiSchemaFolder } = configuration;
        workspaceRoot = workspaceRoot.replace('file://', '');
        uiSchemaFolder = uiSchemaFolder?.replace('file://', '');
        return this.process(
            this.restClient.put(ModelServerPaths.SERVER_CONFIGURE, { workspaceRoot, uiSchemaFolder }),
            MessageDataMapper.isSuccess
        );
    }

    ping(): Promise<boolean> {
        return this.process(this.restClient.get(ModelServerPaths.SERVER_PING), MessageDataMapper.isSuccess);
    }

    edit(modeluri: string, command: ModelServerCommand, format = this.defaultFormat): Promise<boolean> {
        return this.process(
            this.restClient.patch(ModelServerPaths.EDIT, { data: command }, { params: { modeluri, format } }),
            MessageDataMapper.isSuccess
        );
    }

    undo(modeluri: string): Promise<string> {
        return this.process(this.restClient.get(ModelServerPaths.UNDO, { params: { modeluri } }), MessageDataMapper.asString);
    }

    redo(modeluri: string): Promise<string> {
        return this.process(this.restClient.get(ModelServerPaths.REDO, { params: { modeluri } }), MessageDataMapper.asString);
    }

    send(modelUri: string, message: ModelServerMessage): void {
        const openSocket = this.openSockets.get(modelUri);
        if (openSocket) {
            openSocket.send(message);
        }
    }

    subscribe(modeluri: string, options: SubscriptionOptions = {}): SubscriptionListener {
        if (!options.listener) {
            const errorMsg = `${modeluri} : Cannot subscribe. No lister is present!'`;
            throw new Error(errorMsg);
        }
        if (this.isSocketOpen(modeluri)) {
            const errorMsg = `${modeluri} : Cannot open new socket, already subscribed!'`;
            console.warn(errorMsg);
            if (options.errorWhenUnsuccessful) {
                throw new Error(errorMsg);
            }
        }
        const path = this.createSubscriptionPath(modeluri, options);
        this.doSubscribe(options.listener, modeluri, path);
        return options.listener;
    }

    unsubscribe(modeluri: string): void {
        const openSocket = this.openSockets.get(modeluri);
        if (openSocket) {
            openSocket.close();
            this.openSockets.delete(modeluri);
        }
    }

    protected createSubscriptionPath(modeluri: string, options: SubscriptionOptions): string {
        const queryParams = new URLSearchParams();
        queryParams.append('modeluri', modeluri);
        if (!options.format) {
            options.format = this.defaultFormat;
        }
        Object.entries(options).forEach(entry => queryParams.append(entry[0], entry[1]));
        queryParams.delete('errorWhenUnsuccessful');
        return `${this._baseUrl}${ModelServerPaths.SUBSCRIPTION}?${queryParams.toString()}`.replace(/^(http|https):\/\//i, 'ws://');
    }

    protected doSubscribe(listener: SubscriptionListener, modelUri: string, path: string): void {
        const socket = new WebSocket(path.trim());
        socket.onopen = event => listener.onOpen?.(modelUri, event);
        socket.onclose = event => listener.onClose?.(modelUri, event);
        socket.onerror = event => listener.onError?.(modelUri, event);
        socket.onmessage = event => listener.onMessage?.(modelUri, event);
        this.openSockets.set(modelUri, socket);
    }

    protected isSocketOpen(modelUri: string): boolean {
        return this.openSockets.get(modelUri) !== undefined;
    }

    protected async process<T>(request: Promise<AxiosResponse<ModelServerMessage>>, mapper: MessageDataMapper<T>): Promise<T> {
        try {
            const response = await request;
            if (response.data.type === 'error') {
                throw new ModelServerError(response.data);
            }
            return mapper(response.data);
        } catch (error) {
            if (isAxiosError(error)) {
                const message = error.response?.data ? error.response.data : error.message;
                throw new ModelServerError(message, error.code);
            } else {
                throw error;
            }
        }
    }
}

function isAxiosError(error: any): error is AxiosError {
    return error !== undefined && error instanceof Error && 'isAxiosError' in error && error['isAxiosError'];
}

/**
 * Helper type for method overloads where on parameter could either be
 * a 'format' string or a typeguard to cast the response to a concrete type.
 */
type FormatOrGuard<M> = string | TypeGuard<M>;

function mapModel<M>(model: Model, guard?: TypeGuard<M>, toString = false): Model<AnyObject | M | string> {
    const { modelUri, content } = model;
    if (guard) {
        return { modelUri, content: asType(content, guard) };
    } else if (toString) {
        return { modelUri, content: asString(content) };
    }
    return { modelUri, content: asObject(content) };
}