(function (global, undefined) {
    "use strict";

    var isArray = (function () {
        return Array.isArray
            ? function (v) {
                return Array.isArray(v);
            }
            : function (v) {
                return Object.prototype.toString.call(v) === '[object Array]';
            };
    }());

	// export to the global scope some functions
	global.layOutDay    = layOutDay;
	global.render       = render;

	/**
	 * Lays out events for a single  day
	 *
	 * @param   {Array}     _events     An array of event objects. Each event object consists of a start and end
	 *                                  time  (measured in minutes) from 9am, as well as a unique id. The start and
	 *                                  end time of each event will be [0, 720]. The start time will be less than the
	 *                                  end time.
	 *
	 * @return  {Array}     An array of event objects that has the width, the left and top positions set, in addition to the id,
	 *                      start and end time. The object should be laid out so that there are no overlapping
	 *                      events.
	 */
	function layOutDay (_events) {
	    var MAX_WIDTH   = 620,
	        MIN_LEFT    = 10,
	        events,
	        eventsUnder;

	    if (!isArray(_events)) {
	        throw new Error('Events must be an array');
	    }

		// setup events array parameters before processing
	    events = cloneEvents(_events);
	    events.sort(compareStartEndTime);
	    updateCollisions(events);

		// get events that will be positioned between and under other events
	    eventsUnder = getEventsUnder(events);

		// set lay out parameters for the first part of the events
	    setLayOutParams(events, MIN_LEFT, MAX_WIDTH);

		// process events under
		processEventsUnder(eventsUnder, events);

	    return normalizeEvents(events.concat(eventsUnder));
	}

	/**
	 * Clone original events array.
	 *
	 * @param   {Array}     _events     Original array of the events objects.
	 *
	 * @return  {Array}     Cloned array of the events object.
	 */
	function cloneEvents (_events) {
		var clonedEvents    = [],
			i               = 0,
			event;

		if (!isArray(_events)) {
			throw new Error('Events must be an array');
		}

		for (; (event = _events[i]); ++i) {
			clonedEvents.push({
				id:             event.id,
				start:          event.start,
				end:            event.end,
				collisions:     [],
				left:           0,
				width:          0,
				hasEventUnder:  false,
				topEventId:     null
			});
		}

		return clonedEvents;
	}

	/**
	 * Return array of the normalized events object with "left" and "top" positions and "width"
	 *
	 * @param   {Array}     _events     Array of the "working" events objects.
	 *
	 * @return  {Array}     Array of the normalized events objects.
	 */
	function normalizeEvents (_events) {
		var normalizedEvents    = [],
			i                   = 0,
			event;

		if (!isArray(_events)) {
			throw new Error('Events must be an array');
		}

		for (; (event = _events[i]); ++i) {
			normalizedEvents.push({
				id:     event.id,
				start:  event.start,
				end:    event.end,
				left:   event.left,
				width:  event.width,
				top:    event.start
			});
		}

		return normalizedEvents;
	}

	/**
	 * Compares events objects by start and end time
	 *
	 * @param   {Object}    a       First event object
	 * @param   {Object}    b       Second event object
	 *
	 * @return  {number}    Result of the comparison
	 */
	function compareStartEndTime (a, b) {
	    return (a.start == b.start)
	        ? (a.end > b.end) ? -1 : 1
	        : (a.start > b.start)
	            ? 1
	            : -1;
	}

	/**
	 * This function splits events array on two parts:
	 * - 1nd part contains chained events (events which could not placed under previous events (original event array changed)
	 * - 2nd part contains events that will be positioned between and under some other events.
	 * and return 2nd part
	 *
	 * @param   {Array}     _events     An array of event objects.
	 *
	 * @return  {Array}     Array of the events objects that will be positioned between and under some other events.
	 */
	function getEventsUnder (_events) {
	    var eventsUnder = [],
		    start       = 0,
		    i           = 0,
		    j,
		    currentEvent,
		    leftEvent,
		    temp;

	    for (; (currentEvent = _events[i]); ++i) {
	        if (getLeftCollisionsCount(currentEvent.collisions, i)) {
		        // check on empty space under the "left" events
	            for (j = start; j < i; ++j) {
		            leftEvent = _events[j];

		            // if events not collides with each other and left event does not have some
		            // other event "under" it - then move current event to the 2nd array
	                if (!isEventsCollides(leftEvent, currentEvent) && !leftEvent.hasEventUnder) {
	                    // remove current event from the events array
		                temp            = _events.splice(i, 1)[0];
	                    temp.topEventId = leftEvent.id;

		                eventsUnder.push(temp);

		                leftEvent.hasEventUnder = true;

		                // because we just changed events array we need to update collisions information
	                    updateCollisions(_events);

	                    --i;
	                    break;
	                }
	            }
	        } else {
	            start = i;
	        }
	    }

		// update collisions information
		if (eventsUnder.length) {
			updateCollisions(eventsUnder);
		}

	    return eventsUnder;
	}

	/**
	 * Processes array of the events objects that will be positioned between and under some other events.
	 *
	 * @param   {Array}     _eventsUnder    Array of the events objects that will be positioned between and under some
	 *                                      other events.
	 * @param   {Array}     _events         An array of event objects.
	 */
	function processEventsUnder (_eventsUnder, _events) {
		var eventIdxById     = {},
			eventsGroups    = {},
			i               = 0,
			event,
			eventGroup,
			nextEvent,
			eventAtTopId,
			eventAtTopIdx,
			eventAtTop,
			hasTopCollisionAtRight;

		// fill events by id hash
		for (; (event = _events[i]); ++i) {
			eventIdxById[event.id] = i;
		}

		// group events by top
		for (i = 0; (event = _eventsUnder[i]); ++i) {

			eventAtTopId    = event.topEventId;
			eventAtTopIdx   = eventIdxById[eventAtTopId];
			eventAtTop      = _events[eventAtTopIdx];

			if (!eventsGroups[eventAtTopId]) {
				eventsGroups[eventAtTopId] = {
					items:  [],
					left:   eventAtTop.left,
					width:  eventAtTop.width
				}
			}

			eventGroup = eventsGroups[eventAtTopId];
			eventGroup.items.push(event);

			nextEvent = _eventsUnder[i + 1];

			hasTopCollisionAtRight = _events[eventAtTopIdx + 1] && nextEvent
				? _events[eventAtTopIdx + 1].id == nextEvent.topEventId && isEventsCollides(nextEvent, event)
				: false;

			// if current event does not have collisions and "top" event does not have collisions at right
			// try to set maximum width for the current event
			if (eventAtTop.collisions.length && !hasTopCollisionAtRight) {
				var left                = eventAtTop.left,
					width               = eventAtTop.width,
					j                   = eventAtTopIdx - 1,
					leftCollisionsCount = getLeftCollisionsCount(event.collisions, i),
					otherEventGroup;

				if (leftCollisionsCount) {
					// try to fit between other events at the left
					for (j = 0; j < i; ++j) {
						otherEventGroup = eventsGroups[_eventsUnder[j].topEventId];

						if (isEventsCollides(_eventsUnder[j], event) && otherEventGroup.left < eventGroup.left) {
							left    = otherEventGroup.left + otherEventGroup.width;
							width   = width + (eventAtTop.left - left);
						}
					}
				} else {
					// try to fit at the left events
					for (; j >= 0; --j) {
						if (isEventsCollides(_events[j], event)) {
							left    = _events[j].left + _events[j].width;
							width   = width + (eventAtTop.left - left);
							break;
						}
					}
				}

				// try to fit at the right side
				j = eventAtTopIdx + 1;
				for (; j < _events.length; ++j) {
					if (isEventsCollides(_events[j], event)) {
						width = _events[j].left - left;
						break;
					}
				}

				eventGroup.left     = left;
				eventGroup.width    = width;
			}
		}

		// setup lay out params for events
		for (i in eventsGroups) {
			if (eventsGroups.hasOwnProperty(i)) {
				setLayOutParams(eventsGroups[i].items, eventsGroups[i].left, eventsGroups[i].width);
			}
		}
	}

	/**
	 * Set up lay out parameters for events
	 *
	 * @param   {Array}     _events     An array of event objects.
	 * @param   {number}    minLeft     Minimum left position.
	 * @param   {number}    maxWidth    Maximum width of the event.
	 */
	function setLayOutParams (_events, minLeft, maxWidth) {
		var i       = 0,
			start   = 0,
			leftCollisionsCount,
			left,
			width,
			event,
			k;

		for (; (event = _events[i]); ++i) {
			leftCollisionsCount = getLeftCollisionsCount(event.collisions, i);

			if (!leftCollisionsCount) {
				event.left = minLeft;
				event.width = maxWidth;
				start = i;
			} else {
				left    = _events[event.collisions[0]].left;
				width   = (maxWidth / (i - start + 1)) << 0;

				for (k = start; k < i; ++k) {
					if (k == start && left > _events[start].left) {
						left = _events[start].left;
					}

					_events[k].width    = width;
					_events[k].left     = Math.max(left, minLeft);

					left += _events[k].width;
				}

				event.left = left;
				event.width = width;
			}
		}
	}

	/**
	 * Checks on collision between two events
	 *
	 * @param {Object}  a   First event object.
	 * @param {Object}  b   Second event object.
	 *
	 * @return {boolean}    "True" if events have collision, otherwise "false".
	 */
	function isEventsCollides (a, b) {
		return (a.end > b.start && a.end <= b.end) || (a.start >= b.start && a.start < b.end) || (a.start < b.start && a.end > b.end);
	}

	/**
	 * Updates information about collisions between events
	 *
	 * @param   {Array}     _events     An array of event objects.
	 */
	function updateCollisions (_events) {
		var i = 0,
			len = _events.length,
			j;

		for (; i < len; ++i) {
			_events[i].collisions = [];
		}

		for (i = 0; i < len - 1; ++i) {
			for (j = i + 1; j < len; ++j) {
				if (isEventsCollides(_events[i], _events[j])) {
					_events[i].collisions.push(j);
					_events[j].collisions.push(i);
				}
			}
		}
	}

	/**
	 * Gets number of the collision at the left side
	 *
	 * @param   {Array}     _collisions     An array of the indices of the collisions events.
	 * @param   {number}    _eventIdx       Event index at the events array.
	 *
	 * @return  {number}    Number of the collisions at the left side.
	 */
	function getLeftCollisionsCount (_collisions, _eventIdx) {
		var count = 0;

		while (_collisions[count] < _eventIdx) {
			++count;
		}

		return count;
	}

	/**
	 * Render events objects
	 *
	 * @param   {Array}     _events     An array of event objects.
	 */
	function render (_events) {
		var container = document.getElementById('events'),
			i = 0,
			documentFragment = document.createDocumentFragment(),
			eventEl,
            contentEl,
			event;

		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		for (; (event = _events[i]); ++i) {
			documentFragment.appendChild(createEventElement(event));
		}

		container.appendChild(documentFragment);

		eventEl             = null;
        contentEl           = null;
		documentFragment    = null;
	}

	/**
	 * Create HTML-element for the specified event object
	 *
	 * @param   {Object}    _event      An event object.
	 *
	 * @return  {HTMLElement}   HTML-element for specified event object.
	 */
	function createEventElement (_event) {
		var eventEl         = document.createElement('DIV'),
			eventContentEl  = document.createElement('DIV'),
			titleEl         = document.createElement('P'),
			locationEl      = document.createElement('P');

		eventEl.className = 'event';

		eventEl.style.left      = _event.left + 'px';
		eventEl.style.top       = _event.top + 'px';
		eventEl.style.width     = _event.width + 'px';
		eventEl.style.height    = _event.end - _event.start + 'px';

		eventContentEl.className = 'content'

		titleEl.className = 'title';
		titleEl.innerHTML = 'Sample Event';

		locationEl.className = 'location';
		locationEl.innerHTML = 'Sample Location';

		eventContentEl.appendChild(titleEl);
		eventContentEl.appendChild(locationEl);
		eventEl.appendChild(eventContentEl);

		return eventEl;
	}

}(window));