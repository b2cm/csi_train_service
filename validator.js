// Validation module for train journey data using Joi schema validation
const Joi = require('joi')

// Higher-order function that creates a validator function for a given schema
// Returns all validation errors instead of stopping at the first one (abortEarly: false)
const validator = (schema) => (payload) => 
    schema.validate(payload, {abortEarly: false})


// Schema for validating individual journey legs
// Each leg represents one train connection in a multi-leg journey
const legSchema = Joi.object({
    train: Joi.string().required(), // Train identifier (e.g., "IC 705", "RE 1234")
    start_stop: Joi.string().required(), // Departure station name
    start_time: Joi.string().regex(/^([0-2][0-9])\:([0-5][0-9])$/), // Departure time in HH:MM format
    start_date: Joi.string().regex(/^(2[0-9]{3})\-([0-1][0-9])\-([0-3][0-9])$/), // Departure date in YYYY-MM-DD format
    arrival_stop: Joi.string().required(), // Arrival station name
    arrival_time: Joi.string().regex(/^([0-2][0-9])\:([0-5][0-9])$/), // Arrival time in HH:MM format
    arrival_date: Joi.string().regex(/^(2[0-9]{3})\-([0-1][0-9])\-([0-3][0-9])$/) // Arrival date in YYYY-MM-DD format
})

// Schema for validating policy type requests
// Used to determine which payout calculation to use
const typeSchema = Joi.object({
    type: Joi.string().valid('small', 'medium', 'large', 'all').required(), // Insurance policy types
})

// Export validator functions for use in API endpoints
exports.validateLeg = validator(legSchema)
exports.validateType = validator(typeSchema)

