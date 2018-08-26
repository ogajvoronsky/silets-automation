// For lights on tower
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
let button1_pin = 0; // D3 Button (ground-470 Ohm)
let button2_pin = 4; // D2
let load1_pin = 5; // D1 Pin the relay is connected to
let load2_pin = 14; // D5
let pir_pin = 16; // D0 PIR sensor  (connects to ground then motion detected)
let pir_state = 0; // low level - no motion

let ON = 0; // GPIO output logical levels
let OFF = 1;
let load1_state = 0; // Initial state of light (OFF)
let load2_state = 0; // Initial state of light (OFF)
let long_press_time = 1000; // ms
// MQTT namespace
let cmd1_topic = 'silets/tower/light1/command'; // command topic (we receive)
let sta1_topic = 'silets/tower/light1/state'; // state topic (we publish)
let cmd2_topic = 'silets/tower/light2/command'; // command topic (we receive)
let sta2_topic = 'silets/tower/light2/state'; // state topic (we publish)
let cmd_topic  = 'silets/tower/light/command'; // command topic for 2 lights
let alarm_topic = 'silets/alarm';
let heartbeat = 'silets/tower/heartbeat';
let gate_cmd_topic = 'silets/gate/light/command';
let evs = '???'; //network state


// Initialize pins
GPIO.set_mode(led_pin, GPIO.MODE_OUTPUT);
GPIO.set_mode(button1_pin, GPIO.MODE_INPUT);
GPIO.set_mode(button2_pin, GPIO.MODE_INPUT);
GPIO.set_mode(load1_pin, GPIO.MODE_OUTPUT);
GPIO.set_mode(load2_pin, GPIO.MODE_OUTPUT);
GPIO.set_mode(pir_pin, GPIO.MODE_INPUT);
GPIO.set_pull(pir_pin, GPIO.PULL_DOWN);
GPIO.write(load1_pin, !load1_state);
GPIO.write(load2_pin, !load2_state);



// Functions
let sw = function(pin,val) {
    if (pin === 'all') {
        GPIO.write(load1_pin, val);
        MQTT.pub(sta1_topic, (val === ON) ? 'ON': 'OFF',1,1);
        load1_state = val;
        GPIO.write(load2_pin, val);
        MQTT.pub(sta2_topic, (val === ON) ? 'ON': 'OFF',1,1);
        load2_state = val;
    }
    if (pin === load1_pin) {
        GPIO.write(load1_pin, val);
        MQTT.pub(sta1_topic, (val === ON) ? 'ON': 'OFF',1,1);
        load1_state = val;
    }
    if (pin === load2_pin) {
        GPIO.write(load2_pin, val);
        MQTT.pub(sta2_topic, (val === ON) ? 'ON': 'OFF',1,1);
        load2_state = val;
    }
          
};


let sw_toggle = function(pin) {
    if (pin === 'all') {
        (load1_state === OFF) ? sw(load1_pin, ON) : sw(load1_pin, OFF);
        (load2_state === OFF) ? sw(load2_pin, ON) : sw(load2_pin, OFF);
    }
    if (pin === load1_pin) {
        (load1_state === OFF) ? sw(load1_pin, ON) : sw(load1_pin, OFF);
    }
    if (pin === load2_pin) {
        (load2_state === OFF) ? sw(load2_pin, ON) : sw(load2_pin, OFF);
    }
};

let long_press_toggle = function() {
    MQTT.pub(gate_cmd_topic, 'TOGGLE',1);
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
    return JSON.stringify({
        tower_heartbeat: {
            total_ram: Sys.total_ram(),
            free_ram: Sys.free_ram(),
            uptime: Sys.uptime(),
        }
    });
};


// Subscribe for incoming commands
MQTT.sub(cmd_topic, function(conn, topic, msg) {
    print('MQTT recieved topic:', topic, 'message:', msg);
    if (msg === 'ON') {
        sw('all', ON);
    }
    if (msg === 'OFF') {
        sw('all', OFF);
    }
    if (msg === 'TOGGLE') {
        sw_toggle('all');
    }
}, null);

MQTT.sub(cmd1_topic, function(conn, topic, msg) {
    print('MQTT recieved topic:', topic, 'message:', msg);
    if (msg === 'ON') {
        sw(load1_pin, ON);
    }
    if (msg === 'OFF') {
        sw(load1_pin, OFF);
    }
    if (msg === 'TOGGLE') {
        sw_toggle(load1_pin);
    };
}, null);

MQTT.sub(cmd2_topic, function(conn, topic, msg) {
    print('MQTT recieved topic:', topic, 'message:', msg);
    if (msg === 'ON') {
        sw(load2_pin, ON);
    }
    if (msg === 'OFF') {
        sw(load2_pin, OFF);
    }
    if (msg === 'TOGGLE') {
        sw_toggle(load2_pin);
    }
}, null);


// Toggle load on a button press. 
GPIO.set_button_handler(button1_pin, GPIO.PULL_UP, GPIO.INT_EDGE_NEG, 200, function() {
    sw_toggle(load1_pin);
    print('Switch1 turned to', (load1_state === ON) ? 'ON' : 'OFF');
    (load1_state === ON) ? MQTT.pub(cmd1_topic, 'ON', 1, 1) : MQTT.pub(cmd1_topic, 'OFF', 1, 1); // for perstistency
    MQTT.pub(alarm_topic, "tower button pressed", 0);
    Timer.set(long_press_time, 0, function() {
        // 1 sec since button press - check if button still pressed
        if (GPIO.read(button1_pin) === ON ) { 
            long_press_toggle();
            sw_toggle(load1_pin);
        }  
    }, null);
}, null);

GPIO.set_button_handler(button2_pin, GPIO.PULL_UP, GPIO.INT_EDGE_NEG, 200, function() {
    sw_toggle(load2_pin);
    print('Switch2 turned to', (load2_state === ON) ? 'ON' : 'OFF');
    (load2_state === 0) ? MQTT.pub(cmd2_topic, 'ON', 1, 1) : MQTT.pub(cmd2_topic, 'OFF', 1, 1); // for perstistency
    MQTT.pub(alarm_topic, "tower button pressed", 0);
    // Timer.set(long_press_time, 0, function() {
    //     // 1 sec since button press - check if button still pressed
    //     !GPIO.read(button2_pin) ? long_press_toggle();
    // }, null);
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
            MQTT.pub(alarm_topic, "tower motion start", 0);
            print('Motion started');
        } else {
            print('Motion ended');
            MQTT.pub(alarm_topic, "tower motion end", 0);
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