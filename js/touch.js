(function(window) {
	var document = window.document,
		createTouchEvent = function (eventName, target, params) {
			var k,
				event = document.createEvent('Event');

			event.initEvent(eventName, true, true);
			for (k in params) {
				event[k] = params[k];
			}
			target.dispatchEvent(event);
		},
		/**
		 * ECMAScript 5 accessors to the rescue
		 * @see http://perfectionkills.com/how-ecmascript-5-still-does-not-allow-to-subclass-an-array/
		 */
		makeSubArray = (function() {

			var MAX_SIGNED_INT_VALUE = Math.pow(2, 32) - 1,
				hasOwnProperty = Object.prototype.hasOwnProperty;

			function ToUint32(value) {
				return value >>> 0;
			}

			function getMaxIndexProperty(object) {
				var maxIndex = -1,
					isValidProperty,
					prop;

				for (prop in object) {

					isValidProperty = (
						String(ToUint32(prop)) === prop &&
							ToUint32(prop) !== MAX_SIGNED_INT_VALUE &&
							hasOwnProperty.call(object, prop));

					if (isValidProperty && prop > maxIndex) {
						maxIndex = prop;
					}
				}
				return maxIndex;
			}

			return function(methods) {
				var length = 0;
				methods = methods || { };

				methods.length = {
					get: function() {
						var maxIndexProperty = +getMaxIndexProperty(this);
						return Math.max(length, maxIndexProperty + 1);
					},
					set: function(value) {
						var constrainedValue = ToUint32(value);
						if (constrainedValue !== +value) {
							throw new RangeError();
						}
						for (var i = constrainedValue, len = this.length; i < len; i++) {
							delete this[i];
						}
						length = constrainedValue;
					}
				};
				methods.toString = {
					value: Array.prototype.join
				};
				return Object.create(Array.prototype, methods);
			};
		})(),
	    // methods passed to TouchList closure method to extend Array
		touchListMethods = {
			/**
			 * Returns touch by id. This method fulfill the TouchList interface.
			 * @params {Number} id
			 * @returns {Touch}
			 */
			identifiedTouch: {
				value: function (id) {
					var length = this.length;
					while (length--) {
						if (this[length].identifier === id) return this[length];
					}
					return undefined;
				}
			},
			/**
			 * Returns touch by index. This method fulfill the TouchList interface.
			 * @params {Number} index
			 * @returns {Touch}
			 */
			item: {
				value: function (index) {
					return this[index];
				}
			},
			/**
			 * Returns touch index
			 * @params {Touch} touch
			 * @returns {Number}
			 */
			_touchIndex: {
				value: function (touch) {
					var length = this.length;
					while (length--) {
						if (this[length].pointerId == touch.pointerId) return length;
					}
					return -1;
				}
			},

			/**
			 * Add all events and convert them to touches
			 * @params {Event[]} events
			 */
			_addAll: {
				value: function(events) {
					var i = 0,
						length = events.length;

					for (; i < length; i++) {
						this._add(events[i]);
					}
				}
			},

			/**
			 * Add and MSPointer event and convert it to Touch like object
			 * @params {Event} event
			 */
			_add: {
				value: function(event) {
					var index = this._touchIndex(event),
						id = event.pointerId;

					index = index < 0 ? this.length - 1 : index;

					//normalizing Pointer to Touch
					event.type = "MSPointerMove";
					event.identifier = event.pointerId;
					//in DOC is mentioned that it is 0..255 but actually it returns 0..1 value
					event.force = event.pressure;
					//default values for Touch which we cannot obtain from Pointer
					event.radiusX = event.radiusY = 1;
					event.rotationAngle = 0;

					this[index] = event;
				}
			},

			/**
			 * Removes an event from this touch list.
			 * @params {Event} event
			 */
			_remove: {
				value: function(event) {
					var id = event.pointerId,
						index = this._touchIndex(event);

					if (index >= 0) {
						this.splice(index,1);
					}
				}
			}
		},

		/**
		 * This class store touches in an list which can be also accessible as array which is
		 * little bit bad because TouchList have to extend Array. Because we are aiming on
		 * IE10+ we can use ECMAScript5 solution.
		 * @extends Array
		 * @see http://www.w3.org/TR/2011/WD-touch-events-20110913/#touchlist-interface
		 * @see https://developer.mozilla.org/en-US/docs/DOM/TouchList
		 */
		TouchList = (function(methods) {
			return function() {
				var arr = makeSubArray(methods);
				if (arguments.length === 1) {
					arr.length = arguments[0];
				}
				else {
					arr.push.apply(arr, arguments);
				}
				return arr;
			};
		})(touchListMethods),
		/**
		 * list of all touches running during life cycle
		 * @type TouchList
		 */
		generalTouchesHolder,
		/**
		 * Storage of link between pointer {id} and original target
		 * @type Object
		 */
		pointerToTarget = {},
		/**
		 * Checks if node is some of parent children or sub-children
		 * @param {HTMLElement|Document} parent
		 * @param {HTMLElement} node
		 * @returns {Boolean}
		 */
		checkSameTarget = function (parent, node) {
			if (node) {
				if (parent === node) {
					return true;
				} else {

					return checkSameTarget(parent, node.parentNode);
				}
			} else {
				return false;
			}
		},
		/**
		 * Main function which is rewriting the touch event to MSPointer event
		 * and preparing all the necessary lists of touches.
		 * @param {Event} evt
		 */
		pointerListener = function (evt) {
			var type,
				target = evt.target,
				changedTouches,
				targetTouches;

			if (evt.type === "MSPointerDown") {
				generalTouchesHolder._add(evt);
				pointerToTarget[evt.pointerId] = evt.target;

				type = "touchstart";
			}

			if (evt.type === "MSPointerMove" && generalTouchesHolder.identifiedTouch(evt.pointerId)) {
				generalTouchesHolder._add(evt);

				type = "touchmove";
			}

			//Preparation of touch lists have to be done before MSPointerUp where we delete some information

			//Which touch fired this event, because we know that MSPointer event is fired for every
			//changed pointer than we create a list only with actual pointer
			changedTouches = document.createTouchList(evt);
			//Target touches is list of touches which started on (touchstart) on target element, they
			//are in this array even if these touches have coordinates outside target elements
			targetTouches = document.createTouchList();
			for (var i = 0; i < generalTouchesHolder.length; i++) {
				targetTouches._add(generalTouchesHolder[i]);
			}

			if (evt.type === "MSPointerUp") {
				generalTouchesHolder._remove(evt);
				pointerToTarget[evt.ponterId] = null;

				delete pointerToTarget[evt.ponterId];
				type = "touchend";
			}

			createTouchEvent(type, target, {touches: generalTouchesHolder, changedTouches: changedTouches, targetTouches: targetTouches});
		},
		/**
		 * This method augments event listener methods on given class to call
		 * our own method which attach/detach the MSPointer events handlers
		 * when user tries to attach touch events.
		 * @param {Function} elementClass Element class like HTMLElement or Document
		 */
		augmentEventListener = function(elementClass) {
			var customAddEventListener = attachTouchEvents,
				customRemoveEventListener = removeTouchEvents,
				oldAddEventListener = elementClass.prototype.addEventListener,
				oldRemoveEventListener = elementClass.prototype.removeEventListener;

			elementClass.prototype.addEventListener = function(type, listener, useCapture) {
				//this je element, uchovat
				window.navigator.msPointerEnabled && customAddEventListener.call(this, type, listener, useCapture);
				oldAddEventListener.call(this, type, listener, useCapture);
			};

			elementClass.prototype.removeEventListener = function(type, listener, useCapture) {
				window.navigator.msPointerEnabled && customRemoveEventListener.call(this, type, listener, useCapture);
				oldRemoveEventListener.call(this, type, listener, useCapture);
			}
		},
		/**
		 * This method attach event handler for MSPointer events when user
		 * tries to attach touch events.
		 * @param {String} type
		 * @param {Function} listener
		 * @param {Boolean} useCapture
		 */
		attachTouchEvents = function (type, listener, useCapture) {
			//todo store this,type,listener, to know what to call in pointerListener
			if (type.indexOf("touchstart") === 0) {
				this.addEventListener("MSPointerDown", pointerListener, useCapture);
			}
			if (type.indexOf("touchmove") === 0) {
				this.addEventListener("MSPointerMove", pointerListener, useCapture);
			}
			if (type.indexOf("touchend") === 0) {
				this.addEventListener("MSPointerUp", pointerListener, useCapture);
			}

			if (typeof this.style.msTouchAction != 'undefined')
				this.style.msTouchAction = "none";
		},
		/**
		 * This method detach event handler for MSPointer events when user
		 * tries to detach touch events.
		 * @param {String} type
		 * @param {Function} listener
		 * @param {Boolean} useCapture
		 */
		removeTouchEvents = function (type, listener, useCapture) {
			//todo store this,type,listener, to know what to call in pointerListener
			if (type.indexOf("touchstart") === 0) {
				this.removeEventListener("MSPointerDown", pointerListener, useCapture);
			}
			if (type.indexOf("touchmove") === 0) {
				this.removeEventListener("MSPointerMove", pointerListener, useCapture);
			}
			if (type.indexOf("touchend") === 0) {
				this.removeEventListener("MSPointerUp", pointerListener, useCapture);
			}
		};


	/*
	 * Adding DocumentTouch interface
	 * @see http://www.w3.org/TR/2011/WD-touch-events-20110505/#idl-def-DocumentTouch
	 */

	/**
	 * Create touches list from array or touches or given touch
	 * @param {Touch[]|Touch} touches
	 * @returns {TouchList}
	 */
	document.createTouchList = function(touches) {
		var touchList = new TouchList();
		if (touches) {
			if (touches.length) {
				touchList._addAll(touches);
			} else {
				touchList._add(touches);
			}
		}
		return touchList;
	};

	/**
	 * AbstractView view, EventTarget target, long identifier, long pageX, long pageY, long screenX, long screenY
	 *
	 * AbstractView neco jako document.defaultView === window
	 */
	document.createTouch = function(view, target, identifier, pageX, pageY, screenX, screenY) {
		return {
			identifier: identifier,
			screenX: screenX,
			screenY: screenY,
			//clientX: clientX,
			//clientY: clientY,
			pageX: pageX,
			pageY: pageY,
			target: target
		}
	};









	generalTouchesHolder = document.createTouchList();



	// Overriding HTMLElement and HTMLDocument to hand over touch handler to MSPointer event handler
	augmentEventListener(HTMLElement);
	augmentEventListener(Document);
}(window));

//TODO: fake tests for modernizer?
//http://modernizr.github.com/Modernizr/touch.html