const express = require('express')
const rateLimit = require('express-rate-limit')
const cors = require('cors')
const fetch = require('node-fetch')
const ParallelRequest = require('parallel-http-request')
const LRU = require('lru-cache')
const sha256 = require('js-sha256');
const { validateLeg, validateType } = require("./validator")

// dotenv
require('dotenv').config()

// import payouts
const PAYOUTS = require('./payout.json');

// import telegram
const telegram = require('./telegram'); // telegram bot

// express app 
const app = express()

// rate limiter config
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
})

// register middleware
app.use(express.json())
app.use(limiter)
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }))


// global variables
const PORT = 3000
const CONST_DELAY = 60 // this amount of minutes is considered as a delay
const AMOUNT_WEEKS = 6
let BOOL_DELAY = false


// status
const STATUS_OK = 0; // all good
const STATUS_SEV = 10; // journey contains RPS (rail replacement service)
const STATUS_TIME = 20; // journey not in allowed timeframe
const STATUS_PROBABILITY = 30 // probability is too high (> 40%)
const STATUS_MISSING_DELAY = 40; // missing delay, queue request again
const STATUS_ERROR = 100; // something else went wrong

// journey needs to be 1 day in the future and max 10 days in the future
const TIME_MIN = 1
const TIME_MAX = 10


// config for parallel-http-request
const CONFIG_HTTP_PARALLEL = {
  response: 'simple' // [optional] detail|simple|unirest, if empty then the response output is simple
}

const parallelRequest = new ParallelRequest(CONFIG_HTTP_PARALLEL)

// data endpoint (zugfinder.net)
const zugfinderURL = process.env.ZUFINDER_URL


// cache config
const options = {
  max: 500, // max 500 entries
  ttl: 1000 * 60 * 10, // time-to-live 10 minutes
  ttlResolution: 1000 // check every 1s for stale entries (that died due to ttl)
}
const cache = new LRU(options)


/**
 * ENDPOINT /payout
 * This endpoint handles both requests from the website and the contract.
 * It awaits a journey object (website) or a encoded journey in bytecode (contract)
 * It returns a payout (or all payout) for the requested journey.
 * The payout is based on the probability for a delay.
 *
 * @param object journey object in json or journey encoded in bytecode, type of policy (small, medium, large, all)
 * @returns payout for a type or all payouts (type = all)
 */
app.post('/payouts', async (req, res) => {
  console.log('[log] received request to endpoint /payouts')

  let journey
  let type = req.body.type // must be "small", "medium", "large" or "all", is validated later

  // handle requests from website and contract
  if (req.body.type != "all") {
    // request comes from contract - parameter has to be decoded
    const encodedJourney = req.body.journey
    journey = decode(encodedJourney)
  } else {
    // request comes from website
    journey = req.body.journey
  }

  // check if body is empty
  if (Object.keys(journey).length === 0 && journey.constructor === Object)
    return res.send({ status: STATUS_ERROR, payout: 0 })

  // error handling
  let messages = []
  for (let leg in journey) {
    const { error, value } = validateLeg(journey[leg])
    if (error != undefined) {
      error.details.forEach(detail => {
        messages.push(detail.message)
      })
    }
  }

  const { error, value } = validateType({ type: type })
  if (error != undefined) {
    error.details.forEach(detail => {
      messages.push(detail.message)
    })
  }

  if (messages.length != 0) // errors found
    return res.send({ status: STATUS_ERROR, payout: 0 })



  // check journey and return status code

  let timeframe = checkTimeframe(journey) // returns true if journey is OUT OF timeframe
  if (timeframe) {
    // return status code
    console.log("[log] journey out of timeframe");
    logRequest(999, "out of timeframe", journey) // log request
    return res.send({ status: STATUS_TIME, payout: 0 })
  }

  // check for rps (rail replacement service)
  let rps = checkForRps(journey)
  if (rps) {
    console.log("[log] journey contains rail replacement service");
    logRequest(999, "includes rail replacement service", journey) // log request
    return res.send({ status: STATUS_SEV, payout: 0 })
  }

  // chache
  let probability
  let hash = sha256(JSON.stringify(journey))
  let entry = cache.get(hash)

  if (entry) { // entry found
    probability = entry
    console.log('[log] found cache entry');
  } else { // calculate probability and save to cache
    try {
      probability = await requestProbability(journey)
    } catch (error) {
      console.error(error)
      return res.send({ status: STATUS_ERROR, payout: 0 })
    }
    cache.set(hash, probability)
    console.log('[log] added cache entry');
  }

  // log request only if it comes from website
  if (req.body.type == "all") {
    logRequest(probability, "ok", journey)
  }

  if (probability > 40) {
    // return status code
    console.log("[log] probability too high (> 40%)");
    return res.send({ status: STATUS_PROBABILITY, payout: 0 })
  }

  let payout
  probability = Math.ceil(probability) // round up

  // check if type == all
  if (type == "all") {
    // get all types
    payout = {
      small: PAYOUTS.small[probability],
      medium: PAYOUTS.medium[probability],
      large: PAYOUTS.large[probability]
    }
  } else {
    payout = PAYOUTS[type][probability]
  }

  let result = {
    status: STATUS_OK,
    payout: payout
  }

  return res.send(result)
})

/**
 * ENDPOINT /delay
 *
 * @param {object} object including journey
 * @returns {object} { "delay": 0 }
 */
app.post('/delay', async (req, res) => {
  console.log('[log] received request to endpoint /delay')

  let journey

  // handle requests from website and contract
  if ('journey' in req.body) {
    // request comes from contract - parameter has to be decoded
    const encodedJourney = req.body.journey
    journey = decode(encodedJourney)
  } else {
    // request comes from website
    journey = req.body
  }

  // check if body is empty
  if (Object.keys(journey).length === 0 && journey.constructor === Object)
    return res.send({ status: STATUS_ERROR, delay: 0 })

  // error handling
  let messages = []
  for (let leg in journey) {
    const { error, value } = validateLeg(journey[leg])
    if (error != undefined) {
      error.details.forEach(detail => {
        messages.push(detail.message)
      })
    }
  }

  if (messages.length != 0) // errors found
    return res.send({ status: STATUS_ERROR, delay: 0 })



  // save scheduled arrival date
  const scheduledArrivalDate = retrieveArrivalDate(journey)

  // request real journey from zugfinder
  const response = await fetch(zugfinderURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(journey)
  }).then(res => res.json())


  console.log('[log] received response from zugfinder; calculating delay..')

  // save real arrival date
  const realArrivalDate = retrieveArrivalDate(response)

  let delay = calculateDelayMinutes(scheduledArrivalDate, realArrivalDate)

  // if train was early set delay to 0
  if (delay < 0) {
    delay = 0
  }

  let result = {
    status: STATUS_OK,
    delay: delay
  }

  console.log('[log] calculated delay in minutes: ' + delay)
  return res.send(result)
})

/**
 * Endpoint for testing
 * Return 62 or 2 as delay, depeding on BOOL_DELAY
 */
app.post('/delayOracleTesting', async (req, res) => {

  let delay
  if (BOOL_DELAY) {
    delay = 62
  } else {
    delay = 2
  }

  let result = {
    status: STATUS_OK,
    delay: delay
  }

  return res.send(result)
})

/**
 * Endpoint for testing
 * Change value of BOOL_DELAY
 */
app.post('/changeDelay', async (req, res) => {
  if (req.body.delay === true) {
    BOOL_DELAY = true
    console.log('[info] changed delay to true')
    return res.send('changed delay to true')
  } else if (req.body.delay === false) {
    BOOL_DELAY = false
    console.log('[info] changed delay to false')
    return res.send('changed delay to false')
  } else {
    return res.send('delay has to be true or false')
  }
})

/**
 * Endpoint for testing
 * Return value of BOOL_DELAY
 */
app.get('/getDelay', async (req, res) => {
  console.log('[info] BOOL_DLEAY is currently set to: ' + BOOL_DELAY)
  return res.send('BOOL_DLEAY is currently set to: ' + BOOL_DELAY)
})


// START SERVER
module.exports = app.listen(PORT, () =>
  console.log(`Server started! Listening on port ${PORT}!`)
)




/**
 * HELPER FUNCTIONS
 */

/**
 * decodes bytecode to a journey object
 * @param _encoded bytecode
 * @returns journey object that according to zugfinder API
 */
function decode(_encoded) {
  // encoded looks like: IC 705;Leipzig HBF;...
  const values = _encoded.split(';')

  if ((values.length % 7) != 0)
    return {}

  const amountLegs = values.length / 7 // one leg has 7 values

  const legs = []

  // build legs
  for (let i = 0; i < amountLegs; i++) {
    const j = i * 7
    const obj = {
      train: values[j],
      start_stop: values[j + 1],
      start_time: values[j + 2],
      start_date: values[j + 3],
      arrival_stop: values[j + 4],
      arrival_time: values[j + 5],
      arrival_date: values[j + 6]
    }
    legs.push(obj)
  }

  // journey object that can be sent to zugfinder
  const journey = {}

  for (let i = 0; i < amountLegs; i++) {
    journey['leg_' + (i + 1)] = legs[i]
  }

  return journey
}

function checkTimeframe(journey) {
  // check if journey is in timeframe
  let now = new Date(Date.now())
  let departure = retrieveDepartureDate(journey)
  let diff = (departure - now) / (1000 * 60 * 60 * 24) // diff in days
  if (diff <= TIME_MIN || diff >= TIME_MAX) {
    return true // journey is out of timeframe
  }
}

function checkForRps(journey) {
  for (i in journey) {
    let leg = journey[i]
    let name = leg.train.toLowerCase()

    if (name.includes("bus")) {
      return true
    }
  }
  return false
}


/***
 * @param _journey journey with all its legs
 * @returns arrival time as date object
 */
function retrieveArrivalDate(_journey) {
  // get last leg of the journey
  const amountLegs = Object.keys(_journey).length
  const arrivalLeg = _journey['leg_' + amountLegs]

  if (arrivalLeg) {
    // create arrival date object
    const arrivalDate = new Date(arrivalLeg.arrival_date)

    // merge time from field arrival_time
    const arrivalTime = arrivalLeg.arrival_time
    arrivalDate.setHours(arrivalTime.split(':')[0])
    arrivalDate.setMinutes(arrivalTime.split(':')[1])

    // return the date object
    return arrivalDate
  } else {
    throw new Error('Missing Data')
  }
}

/***
 * @param _journey journey with all its legs
 * @returns departure time as date object
 */
function retrieveDepartureDate(_journey) {
  // get first leg of the journey
  const departureLeg = _journey['leg_1']

  if (departureLeg) {
    // create arrival date object
    const departureDate = new Date(departureLeg.start_date)

    // merge time from field arrival_time
    const departureTime = departureLeg.start_time
    departureDate.setHours(departureTime.split(':')[0])
    departureDate.setMinutes(departureTime.split(':')[1])

    // return the date object
    return departureDate
  } else {
    throw new Error('Missing Data')
  }
}

/***
  * @param _date date object
  * @returns date as string in format YYYY-MM-DDThh:mm:ss+hh:mm
  * including timezone offset!
  */
function toIsoString(date) {
  var tzo = -date.getTimezoneOffset(),
    dif = tzo >= 0 ? '+' : '-',
    pad = function (num) {
      return (num < 10 ? '0' : '') + num;
    };

  return date.getFullYear() +
    '-' + pad(date.getMonth() + 1) +
    '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) +
    ':' + pad(date.getMinutes()) +
    ':' + pad(date.getSeconds()) +
    dif + pad(Math.floor(Math.abs(tzo) / 60)) +
    ':' + pad(Math.abs(tzo) % 60);
}


/***
 * @param _scheduledDate
 * @param _realDate
 * @returns delay in minutes
 */
function calculateDelayMinutes(_scheduledDate, _realDate) {
  // check for 0:00 transition (bug in zugfinder API)
  // We assume no train arrives earlier than 4 hours
  // so we substract 4 hours from the scheduled arrival time to ignore early trains
  if (_realDate.getTime() < (_scheduledDate.getTime() - 4 * 60 * 60 * 1000)) {
    console.log('[info] detected 0:00 transition with date error - fixing date...')
    _realDate.setDate(_realDate.getDate() + 1)
  }

  // calculate difference
  const diff = (_realDate - _scheduledDate)

  // return in minutes
  return (diff / 1000 / 60)
}

/***
 * Request probability from the prediction endpoint
 * @param requestBody journey with all its legs
 * @returns an object: { "probability": <calculted probability> }
 */
async function requestProbability(requestBody) {

  let amountLegs = Object.keys(requestBody).length
  let arrivalLeg = requestBody['leg_' + amountLegs]

  let req = {
    "departure": requestBody.leg_1.start_stop,
    "arrival": arrivalLeg.arrival_stop,
    "departureDate": toIsoString(retrieveDepartureDate(requestBody))
  }

  const prediction = await fetch(process.env.PREDICTION_URL + '/v2/predict', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(req)
  }).then((res) => {
    if (res.status === 200) {
      return res.json()
    }
    else {
      throw new Error('prediction failed:' + res.status)
    }
  })
  console.log(prediction)

  let prob = prediction["delayProbability"] * 100
  console.log(prob)
  prob = prob.toFixed(2) // two digits after comma

  console.log('[log] probability delay: ' + prob + '%')

  return prob
}

async function logRequest(probability, status, journey) {


  // telegram message
  const output = '*New query on Website* \n\n' +
    '*Time*: ' + telegram.getTime() + '\n' +
    '*Probability*: ' + probability + '\n' +
    '*Status*: ' + status + '\n' +
    '*Departure*: ' + telegram.retrieveDepartureDateString(journey) + '\n' +
    '*Journey*: ' + telegram.retrieveStops(journey)

  telegram.sendMsg(output)

}
