/**
 * PixelNode_Input_bbbTCS34725 
 * 
 * Input from TCS34725 color sensors. Supporting multiple sensors via different i2c-buses. Beaglebone Only.
 * 
 * --------------------------------------------------------------------------------------------------------------------
 * 
 * @author Amely Kling <mail@dwi.sk>
 *
 */


/* Includes
 * ==================================================================================================================== */

var util = require("util");
var _ = require('underscore');
var b = require('bonescript');
var rgbLib = require('bbb-tcs34725');


/* Class Constructor
 * ==================================================================================================================== */

// extending Effect
PixelNode_Input = require('pixelnode-input');

// define the Student class
function PixelNode_Input_bbbTCS34725(options,pixelData) {
  var self = this;
  PixelNode_Input_bbbTCS34725.super_.call(self, options, pixelData);
  this.className = "PixelNode_Input_bbbTCS34725";
}

// class inheritance 
util.inherits(PixelNode_Input_bbbTCS34725, PixelNode_Input);

// module export
module.exports = PixelNode_Input_bbbTCS34725;


/* Variables
 * ==================================================================================================================== */

PixelNode_Input_bbbTCS34725.prototype.default_options = {
	"sensors": [
		{
			"name"	  : "color_left",
		    "bus"     : "/dev/i2c-2", 
		    "led_pin" : "P9_23", 
		    "irq_pin" : "P9_15",
		    "enable"  : "inputs.buttons.button_left"
		},
		{
			"name"	  : "color_right",
			"bus"     : "/dev/i2c-1", 
			"led_pin" : "P9_25", 
			"irq_pin" : "P9_27",
			"enable"  : "inputs.buttons.button_right"
	    }
	]
};

PixelNode_Input_bbbTCS34725.prototype.gammatable = [];



/* Overridden Methods
 * ==================================================================================================================== */

// init effect – override
PixelNode_Input_bbbTCS34725.prototype.init = function() {
	var self = this;

	// start
	console.log("Init Input RGB sensor (TCS34725)".grey);

	// init pins
	this.initSensors();
	this.initGammaTable();

	this.startReading();

}


/* Methods
 * ==================================================================================================================== */

// init sensors
PixelNode_Input_bbbTCS34725.prototype.initSensors = function() {
	var self = this;

	// inputs
	var init_inputs = {};

	// sensors
	self.options.sensors.forEach(function(sensor) {
		// set control pins
		b.pinMode(sensor.led_pin, b.OUTPUT);	// led
		b.pinMode(sensor.irq_pin, b.INPUT);		// irq

		b.digitalWrite(sensor.led_pin, 0);

		init_inputs[sensor.name] = [0,0,0];
	});

	// init pixelNode data
	global.pixelNode.data.extend(["inputs",self.options.name], init_inputs);

}

// init gamma table for correcting color values
PixelNode_Input_bbbTCS34725.prototype.initGammaTable = function() {
	// thanks PhilB for this gamma table!
	// it helps convert RGB colors to what humans see
	for (i=0; i<256; i++) {
	  var x = i;
	  x = x / 255;
	  x = Math.pow(x, 2.5);
	  x = x * 255;
	    
	  this.gammatable[i] = Math.round(x);      
	  //Serial.println(gammatable[i]);
	}

}

// read rgb color from sensor
PixelNode_Input_bbbTCS34725.prototype.getRGBcolor = function(sensor, cb) {
	var self = this;
  var ledON = false;
  var readings = 0;
  var red = 0;
  var green = 0;
  var blue = 0;

  sensor.setIntegrationTime(24, function() {});
  sensor.getRawData(function(err, colors) {
    if (err) {
    	console.log(err);
    	throw err
    };
    if (colors.clear > 0) {
       // get raw values
        var sum = colors.red + colors.green + colors.blue + colors.clear;

        red = colors.red / sum * 256;
        green = colors.green / sum * 256;
        blue = colors.blue / sum * 256;

        // make sure its >= 0
        if (red < 0) red = 0;
        if (green < 0) green = 0;
        if (blue < 0) blue = 0;

        // get interpolation factor
        var factor = 1;
        if (red >= green && red >= blue) {
          factor = 255 / red; 
        } else if (green >= red && green >= blue) {
          factor = 255 / green; 
        } else if (blue >= red && blue >= green) {
          factor = 255 / blue; 
        }

        // interpolate to full color
        red = red * factor;
        green = green * factor;
        blue = blue * factor;

        // gamma correction
        red = self.gammatable[Math.floor(red)];
        green = self.gammatable[Math.floor(green)];
        blue = self.gammatable[Math.floor(blue)];

    } else {
      red = blue = green = 0;
    }

    cb([red,green,blue]);


  });
}

// start reading values

PixelNode_Input_bbbTCS34725.prototype.startReading = function() {
	var self = this;

	// vars
	var sensor;
	var side = 0;
	var sensor_enabled = [];

	// init sensor_enabled memory
	self.options.sensors.forEach(function(sensor) {
		sensor_enabled[sensor.name] = false;
	});

	// check colors every 500ms
	setInterval(function() {

		// check if color should be checked? 
		if (global.pixelNode.data.get(self.options.sensors[side].enable)) {
			var path = ["inputs", self.options.name, self.options.sensors[side].name];

			// on first enabled run, reset color to black
			if (!sensor_enabled[self.options.sensors[side].name]) {
				global.pixelNode.data.set(path, [0,0,0]);
				sensor_enabled[self.options.sensors[side].name] = true;
			
			// if color/sensor is enabled get color
			} else {

				// init rgblib with sensor config
				sensor = rgbLib.use(self.options.sensors[side]);

				// set led on
				sensor.setLED(true);

				// get a timeout of 250ms, this will light up our object a bit
				setTimeout(function() {
					// read the color
					self.getRGBcolor(sensor, function(color) { 
						// set read color value into pixelNode data
						global.pixelNode.data.set(path, color);						
						
						// switch LED off						
						sensor.setLED(false);

						// reset i2c bus to first config
						if (side > 0) {
							rgbLib.use(self.options.sensors[0]);
						}
						
						// switch side after reading
						side = side > 0 ? 0 : 1;
					});  
				}, 250);
			}

		// if sensor should not be changed
		} else {
			// reset enabled memory
			sensor_enabled[self.options.sensors[side].name] = false;

			// switch side
			side = side > 0 ? 0 : 1;
		}


	}, 500);
}



