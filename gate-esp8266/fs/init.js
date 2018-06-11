// For light on gate
load('api_config.js');
load('api_rpc.js');
load('api_dht.js');
load('api_events.js');
load('api_gpio.js');
load('api_mqtt.js');
load('api_net.js');
load('api_sys.js');
load('api_timer.js');
load('api_pwm.js');



// pins & mqtt topics
let led_pin = 2; // status led
let button_pin = 0; // Button (ground-470 Ohm)
let load_pin = 5; // Pin the relay is connected to
let dht_pin = 1; // DHT22 sensor
let pir_pin = 16; // PIR sensor  (connects to ground then motion detected)
let pir_state = 0; // low level - no motion

let ON = 0; // GPIO output logical levels
let OFF = 1;
let state = 0; // Initial state of light (OFF)
let long_press_time = 1000; // ms
// MQTT namespace
let cmd_topic = 'silets/gate/light/command'; // command topic (we receive)
let sta_topic = 'silets/gate/light/state'; // state topic (we publish)
let alarm_topic = 'silets/gate/alarm';
let heartbeat = 'silets/gate/heartbeat';
let tower_cmd_topic = 'silets/tower/light/command';
let evs = '???'; //network state
let temp = 0; // temperature
let hum = 0; //humidity


// Initialize pins
GPIO.set_mode(led_pin, GPIO.MODE_OUTPUT);
GPIO.set_mode(button_pin, GPIO.MODE_INPUT);
GPIO.set_mode(load_pin, GPIO.MODE_OUTPUT);
GPIO.set_mode(pir_pin, GPIO.MODE_INPUT);
GPIO.set_pull(pir_pin, GPIO.PULL_DOWN);
GPIO.write(load_pin, !state);
let dht_sensor = DHT.create(dht_pin, DHT.DHT22);


// Functions
let sw_on = function() {
    GPIO.write(load_pin, ON); // low level turns relay ON
    MQTT.pub(sta_topic, 'ON', 1, 1);
    state = 1;
};

let sw_off = function() {
    GPIO.write(load_pin, OFF); // high level turns relay OFF
    MQTT.pub(sta_topic, 'OFF', 1, 1);
    state = 0;
};

let sw_toggle = function() {
    state ? sw_off() : sw_on();
};

let long_press_toggle = function() {
    MQTT.pub(tower_cmd_topic, 'TOGGLE',1);
};

let led_flash = function(n) {
    // Flash led n-times
    for (let i = 0; i < n; i++) {
        GPIO.write(led_pin, ON);
        Sys.usleep(20000);
        GPIO.write(led_pin, OFF);
        Sys.usleep(40000);
    }
};

let getInfo = function() {
    let h = dht_sensor.getHumidity();
    let t = dht_sensor.getTemp();
    // DHT22 sometimes gives wrong values
    if (t < 100) {
        temp = t;
        hum = h;
    }
    return JSON.stringify({
        gate_heartbeat: {
            total_ram: Sys.total_ram(),
            free_ram: Sys.free_ram(),
            uptime: Sys.uptime(),
            temp: temp,
            hum: hum
        }
    });
};


// Subscribe for incoming commands
MQTT.sub(cmd_topic, function(conn, topic, msg) {
    print('MQTT recieved topic:', topic, 'message:', msg);
    if (msg === 'ON') {
        sw_on();
    };
    if (msg === 'OFF') {
        sw_off();
    };
    if (msg === 'TOGGLE') {
        sw_toggle();
    };
}, null);




// Toggle load on a button press. Button is wired to GPIO pin 0
// ToDo: Catch long press and toggle tower lights
GPIO.set_button_handler(button_pin, GPIO.PULL_UP, GPIO.INT_EDGE_NEG, 200, function() {
    sw_toggle();
    print('Switch turned to', state ? 'ON' : 'OFF');
    state ? MQTT.pub(cmd_topic, 'ON', 1, 1) : MQTT.pub(cmd_topic, 'OFF', 1, 1); // for perstistency
    MQTT.pub(alarm_topic, "Button pressed", 0);
    Timer.set(long_press_time, 0, function() {
        // 1 sec since button press - check if button still pressed
        !GPIO.read(button_pin) ? long_press_toggle();
    }, null);
}, null);


// Blink built-in LED
// once - got IP
// twice - connecting
// 3-time - disconnected
GPIO.write(led_pin, OFF);
Timer.set(4000 /* 4 sec */ , Timer.REPEAT, function() {
    GPIO.write(led_pin, OFF);
    if (evs === 'GOT_IP') { led_flash(1) } else
    if (evs === 'CONNECTING') { led_flash(2) } else
    if (evs === 'DISCONNECTED') { led_flash(3) }

}, null);

// polling motion sensor
Timer.set(500 /* 0.5 sec */ , Timer.REPEAT, function() {
    let state = GPIO.read(pir_pin);
    if (state !== pir_state) {
        pir_state = state;
        if (pir_state) {
            MQTT.pub(alarm_topic, "Motion start", 0);
            print('Motion started');
        } else {
            print('Motion ended');
            MQTT.pub(alarm_topic, "Motion end", 0);
        }
    }
}, null);

//Read & publish temperature every 10 sec(also
// for heartbeat or keepalive purpose)
Timer.set(10000 /* 10 sec */ , Timer.REPEAT, function() {
    MQTT.pub(heartbeat, getInfo(), 0, 0);

}, null);



// Monitor network connectivity.
Event.addGroupHandler(Net.EVENT_GRP, function(ev, evdata, arg) {

    if (ev === Net.STATUS_DISCONNECTED) {
        evs = 'DISCONNECTED';
    } else if (ev === Net.STATUS_CONNECTING) {
        evs = 'CONNECTING';
    } else if (ev === Net.STATUS_CONNECTED) {
        evs = 'CONNECTED';
    } else if (ev === Net.STATUS_GOT_IP) {
        evs = 'GOT_IP';
    }
    print('== Net event:', ev, evs);
}, null);