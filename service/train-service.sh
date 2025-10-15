#!/bin/bash

# Helper script for managing the train-service systemd service
# This script provides convenient commands to control the train-service daemon

# Function to display help information
func_help () {
    echo "usage: ./train-service.sh [parameter]"
    echo "     -start:   start service"
    echo "     -stop:    stop service"
    echo "     -status:  show status"
    echo "     -watch:   watch log"
    echo "     -restart: restart service"
    echo "     -help:    display help"
}


# Check if exactly one parameter is provided, otherwise show help
if [ "$#" != "1" ]; then
    func_help
else
    # Parse the provided parameter and execute corresponding action
    case $1 in

        -start)
            # Start the systemd service and show its status
            echo "[log]: train-service started"
            sudo systemctl start train-service
            sudo systemctl status train-service | grep Active
            ;;

        -stop)
            # Stop the systemd service and show its status
            echo "[log]: train-service stopped"
            sudo systemctl stop train-service
            sudo systemctl status train-service | grep Active
            ;;

        -status)
            # Display current status of the service
            echo "[log]: train-service status:"
            sudo systemctl status train-service | grep Active
            ;;

        -watch)
            # Follow the service logs in real-time using journalctl
            echo "[log]: watching train-service logs.."
            sudo journalctl -u train-service -f
            ;;

        -restart)
            # Restart the service and show its new status
            sudo systemctl restart train-service
            echo "[log]: train-service restarted"
            sudo systemctl status train-service | grep Active
            ;;

        -help)
            # Display help information
            func_help
            ;;

        *)
            # Handle unknown parameters
            echo "unknown argument; use -help"
    esac
fi