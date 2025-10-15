# csi_train_service

This repository contains the backend for the train delay protection. It provides train data, calculates possible payouts using the prediction service, and calculates the actual delay of a journey after it took place. Furthermore, it logs requests using a Telegram bot for monitoring.

## Calculation of the Payout

Based on historical train data, we created a payout matrix that can be found in `payout.json`. This matrix is designed in a way that the protection system does not gain or lose any money for the prototype, making it net-zero. Payouts for trains that are very likely to be punctual are very high, while trains that are very likely to be delayed have pretty low payouts.

The system supports three different protection package types:
- **Small**: Lower coverage with smaller payouts
- **Medium**: Balanced coverage and payout amounts
- **Large**: Higher coverage with larger payouts

## Repository Structure

```
├── package.json              # Node.js dependencies and project configuration
├── server.js                 # Main Express.js server with API endpoints
├── telegram.js               # Telegram bot integration for notifications
├── validator.js              # Input validation schemas using Joi
├── payout.json               # Payout matrix mapping delay probabilities to payout amounts
├── .env.example              # Environment variables template
├── .env                      # Environment configuration (not in git)
├── service/                  # SystemD service configuration files
│   ├── train-service.service # SystemD service definition
│   └── train-service.sh      # Helper script for service management
└── README.md                 # This documentation
```

## Project Setup

### Prerequisites
- Node.js (v16 or higher)
- NPM

### Installation

```sh
npm install
```

### Configuration

1. Copy the environment template:
```sh
cp .env.example .env
```

2. Configure your `.env` file with the following variables:
   - `BOT_TOKEN_PILOT`: Telegram bot token for notifications
   - `CHAT_ID`: Telegram chat/group ID for logging messages
   - `PREDICTION_URL`: URL of the prediction service API
   - `ZUGFINDER_URL`: URL of the train data provider API

### Start Server

```sh
node server.js
```

The server will start listening for requests on port 3000.

### SystemD Service Setup (Linux)

For production deployment on Linux servers:

1. Copy repository to `/opt/train-service`
2. Copy the service file:
```sh
sudo cp service/train-service.service /etc/systemd/system/
```
3. Enable and start the service:
```sh
sudo systemctl enable --now train-service
```

Use the helper script for service management:
```sh
# Start service
./service/train-service.sh -start

# Stop service
./service/train-service.sh -stop

# Check status
./service/train-service.sh -status

# Watch logs
./service/train-service.sh -watch

# Restart service
./service/train-service.sh -restart
```

## API Endpoints

### `POST /payouts`
Calculates insurance payouts based on journey delay probability.

**Request Body:**
```json
{
  "journey": {
    "leg_1": {
      "train": "IC 705",
      "start_stop": "Berlin HBF",
      "start_time": "15:30",
      "start_date": "2025-10-15",
      "arrival_stop": "Hamburg HBF",
      "arrival_time": "17:45",
      "arrival_date": "2025-10-15"
    }
  },
  "type": "all"
}
```

**Response:**
```json
{
  "status": 0,
  "payout": {
    "small": 25,
    "medium": 89,
    "large": 178
  }
}
```

**Status Codes:**
- `0`: Success
- `10`: Journey contains rail replacement service
- `20`: Journey outside allowed timeframe (1-10 days)
- `30`: Delay probability too high (>40%)
- `100`: Error occurred

### `POST /delay`
Calculates actual delay of a completed journey.

**Request Body:**
```json
{
  "leg_1": {
    "train": "IC 705",
    "start_stop": "Berlin HBF",
    "start_time": "15:30",
    "start_date": "2025-10-15",
    "arrival_stop": "Hamburg HBF",
    "arrival_time": "17:45",
    "arrival_date": "2025-10-15"
  }
}
```

**Response:**
```json
{
  "status": 0,
  "delay": 12
}
```

## ⚠️ Important Notice

This repository contains experimental code and may be deprecated due to changes in the dependencies. Always refer to the latest documentation and protocol specifications before using this code in production environments.
