import { PolymerElement } from '../../@polymer/polymer/polymer-element.js';
import { Paho } from './paho.mqtt.javascript/paho-mqtt.js';

/**
 @license
 Copyright 2017, 2018 Sebastian Raff <hobbyquaker@gmail.com> https://github.com/hobbyquaker

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
 Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
/**
 `mqtt-connection` Creates a Connection to the MQTT Broker. Automatically (re)connects and handles
 subscriptions with callbacks. Uses the Eclipse Paho JavaScript client.

 @customElement
 @element mqtt-connection
 @polymer
 */
class MqttConnection extends PolymerElement {
    static get is() { return 'mqtt-connection'; }
    static get properties() {
        return {
            /**
             *  Hostname or IP Address of the MQTT Broker.
             */
            host: {
                type: String
            },
            /**
             *  Port Number of the MQTT Broker.
             */
            port: {
                type: Number
            },
            /**
             * The protocol to use for the connection to the MQTT Broker. Has to be `ws` or `wss`.
             */
            protocol: {
                type: String,
                value: 'ws'
            },
            /**
             * Authentication username
             */
            username: {
                type: String,
                value: ''
            },
            /**
             *  Authentication Password
             */
            password: {
                type: String,
                value: ''
            },
            /**
             *  The MQTT Client id. Will be suffixed with a random 8 digit hex number.
             */
            clientId: {
                type: String,
                value: 'polymer'
            },
            /**
             *  Seconds.
             */
            keepAliveInterval: {
                type: Number,
                value: 10
            },

            /**
             * Indicates if connected to the mqtt broker.
             */
            connected: {
                type: Boolean,
                readOnly: true,
                notify: true,
                value: false,
                reflectToAttribute: true
            },
            /**
             * Fired when `mqtt-connection` changes its connected state.
             *
             * @event connected-changed
             * @param {boolean} Indicates if connected to the mqtt broker.
             */

            /**
             *  Seconds to wait between connection checks.
             */
            reconnectInterval: {
                type: Number,
                value: 3
            },
            /**
             * Topic for the Last-Will/Testament action (published by the broker after this client disconnected).
             */
            willTopic: {
                type: String
            },
            /**
             * Payload for the Last-Will/Testament action.
             */
            willPayload: {
                type: String
            },
            /**
             * Retain flag for the Last-Will/Testament action.
             */
            willRetain: {
                type: Boolean
            }
        }
    }

    __mqttMatch(topic, wildcard) {
        if (topic === wildcard) {
            return true;
        }

        const t = String(topic).split('/');
        const lt = t.length;
        const w = String(wildcard).split('/');
        const lw = w.length;

        let i = 0;
        for (; i < lt; i++) {
            if (t[i] !== w[i] && w[i] !== '+' && w[i] !== '#') {
                return false;
            } else if (w[i] === '#') {
                return true;
            }
        }
        return i === lw;
    }

    connectedCallback() {
        super.connectedCallback();
        this.init();

    }

    init() {
        this.__subscriptions = {};
        this.__subscriptionId = 0;
        const clientIdSuffix = '_' + ('00000000' + Math.floor(Math.random() * 0xffffffff).toString(16)).slice(-8);

        this.__connectOptions = {
            userName: this.username,
            password: this.password,
            cleanSession: true,
            useSSL: this.protocol === 'wss',
            keepAliveInterval: this.keepAliveInterval,
            onSuccess: () => {
                this._setConnected(true);

                Object.keys(this.__subscriptions).forEach(topic => {
                    this.__mqttClient.subscribe(topic);
                });
                this.dispatchEvent(new CustomEvent('connect'))

            },
            onFailure: (err) => {
                /**
                 * Fired on MQTT connection failures
                 *
                 * @event failure
                 * @param {{ errorCode: (string), errorMessage: (string) }}
                 */
                this.dispatchEvent(new CustomEvent('failure', {
                    detail: {errorCode: err.errorCode, errorMessage: err.errorMessage},
                    bubbles: true,
                    composed: true
                }));
            }
        };

        if (typeof this.willTopic !== 'undefined') {
            this.__connectOptions.willMessage = new Paho.MQTT.Message(String(this.willPayload));
            this.__connectOptions.willMessage.destinationName = this.willTopic;
            this.__connectOptions.willMessage.retained = Boolean(this.willRetain);
        }

        this.__mqttClient = new Paho.MQTT.Client(this.host, this.port, this.clientId + clientIdSuffix);

        this.__mqttClient.onConnectionLost = err => {
            this._setConnected(false);
            err = err || {};
            /**
             * Fired on MQTT connection loss
             *
             * @event connection-loss
             * @param {{ errorCode: (string), errorMessage: (string) }}
             */
            this.dispatchEvent(new CustomEvent('connection-loss', {
                detail: {errorCode: err.errorCode, errorMessage: err.errorMessage},
                bubbles: true,
                composed: true
            }));
        };

        this.__mqttClient.onMessageArrived = msg => {
            Object.keys(this.__subscriptions).forEach(topic => {
                if (this.__mqttMatch(msg.destinationName, topic)) {
                    Object.keys(this.__subscriptions[topic]).forEach(id => {
                        const callback = this.__subscriptions[topic][id].callback;
                        if (typeof callback === 'function') {
                            callback(msg.payloadString);
                        }
                    });
                }
            });
        };
        this.__connect();

        /**
         * Fired when mqtt-connection element is ready
         *
         * @event connection-loss
         * @param {}
         */
        this.dispatchEvent(new CustomEvent('ready', {
            detail: {},
            bubbles: true,
            composed: true
        }));

    }

    __connect() {
        setTimeout(() => {this.__connect()}, this.reconnectInterval * 1000);
        if (!this.connected) {
            this.__mqttClient.connect(this.__connectOptions);
        }
    }

    /**
     * Publish a MQTT message.
     *
     * @param {string} topic
     * @param {string} payload
     * @param {{ retain: (boolean|undefined), qos: (number|undefined) }=}
     *  options Object specifying options.  These may include:
     *
     *  * `retain` (boolean, defaults to `false`),
     *  * `qos` (number, defaults to `0`)
     */
    publish(topic, payload, options) {
        options = options || {};
        if (this.connected) {
            if (typeof payload !== 'string') {
                payload = JSON.stringify(payload);
            }
            this.__mqttClient.send(topic, payload, parseInt(options.qos, 10) || 0, Boolean(options.retain));
            return true;
        }
        return false;
    }

    /**
     *  @param {string} topic
     *  @param {function} callback
     *  @returns {subscriptionId} subscriptionId
     */
    subscribe(topic, callback) {
        this.__subscriptionId += 1;
        if (this.__subscriptions[topic]) {
            this.__subscriptions[topic]['s' + this.__subscriptionId] = {callback};
        } else {
            this.__subscriptions[topic] = {};
            this.__subscriptions[topic]['s' + this.__subscriptionId] = {callback};
            if (this.connected) {
                this.__mqttClient.subscribe(topic);
            }
        }
        return {id: this.__subscriptionId, topic};
    }

    /**
     *  Unsubscribe from a previously subscribed topic. Supply the subscriptionId returned by the subscribe
     *  method.
     *
     *  @param {subscriptionId} subscriptionId
     */
    unsubscribe(subscriptionId) {
        if (this.__subscriptions[subscriptionId.topic]) {
            delete this.__subscriptions[subscriptionId.topic]['s' + subscriptionId.id];
            if (Object.keys(this.__subscriptions[subscriptionId.topic]).length === 0) {
                this.__mqttClient.unsubscribe(subscriptionId.topic);
                delete this.__subscriptions[subscriptionId.topic];
            }
        }
    }

}

customElements.define(MqttConnection.is, MqttConnection);
