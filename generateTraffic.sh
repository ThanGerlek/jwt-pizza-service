#!/bin/bash

# Check if host is provided as a command line argument
if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  # http://localhost:3000
  # https://pizza-service.gerleksgarage.click
  exit 1
fi
host=$1

# Returns a random integer near the given value, varying by up to +/-25%
rand_near() {
  local base=$1
  local quarter=$(( base / 4 ))
  local range=$(( quarter * 2 + 1 ))
  echo $(( base - quarter + RANDOM % range ))
}

# Trap SIGINT (Ctrl+C) to execute the cleanup function
cleanup() {
  echo "Terminating background processes..."
  kill $pid1 $pid2 $pid3 $pid4 $pid5
  exit 0
}
trap cleanup SIGINT

# Wrap curl command to return HTTP response codes
execute_curl() {
  echo $(eval "curl -s -o /dev/null -w \"%{http_code}\" $1")
}

# Function to login and get a token
login() {
  response=$(curl -s -X PUT $host/api/auth -d "{\"email\":\"$1\", \"password\":\"$2\"}" -H 'Content-Type: application/json')
  token=$(echo $response | jq -r '.token')
  echo $token
}

# Simulate a user requesting the menu
menu_frequency=3
while true; do
  menu_duration=$(rand_near $menu_frequency)
  result=$(execute_curl $host/api/order/menu)
  echo "Requesting menu..." $result
  sleep $menu_duration
done &
pid1=$!

# Simulate a user with an invalid email and password
invalid_login_frequency=50
while true; do
  invalid_login_duration=$(rand_near $invalid_login_frequency)
  result=$(execute_curl "-X PUT \"$host/api/auth\" -d '{\"email\":\"unknown@jwt.com\", \"password\":\"bad\"}' -H 'Content-Type: application/json'")
  echo "Logging in with invalid credentials..." $result
  sleep $invalid_login_duration
done &
pid2=$!

# Simulate a franchisee logging in
franchisee_frequency=120  # 2min
franchisee_login_time=10  # Time to stay logged in before logout
while true; do
  franchisee_duration=$(rand_near $franchisee_frequency)
  token=$(login "f@jwt.com" "franchisee")
  echo "Login franchisee..." $( [ -z "$token" ] && echo "false" || echo "true" )
  sleep $(( franchisee_duration - franchisee_login_time ))
  result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
  echo "Logging out franchisee..." $result
  sleep $franchisee_login_time
done &
pid3=$!

# Simulate a diner ordering a pizza
order_frequency=50
order_login_time=20  # Time to stay logged in before logout
while true; do
  order_duration=$(rand_near $order_frequency)
  token=$(login "d@jwt.com" "diner")
  echo "Login diner..." $( [ -z "$token" ] && echo "false" || echo "true" )
  result=$(execute_curl "-X POST $host/api/order -H 'Content-Type: application/json' -d '{\"franchiseId\": 1, \"storeId\":1, \"items\":[{ \"menuId\": 1, \"description\": \"Veggie\", \"price\": 0.05 }]}'  -H \"Authorization: Bearer $token\"")
  echo "Bought a pizza..." $result
  sleep $order_login_time
  result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
  echo "Logging out diner..." $result
  sleep $(( order_duration - order_login_time ))
done &
pid4=$!

# Simulate a failed pizza order
failed_order_frequency=300  # 5min
failed_order_login_time=5  # Time to stay logged in before logout
while true; do
  failed_order_duration=$(rand_near $failed_order_frequency)
  token=$(login "d@jwt.com" "diner")
  echo "Login hungry diner..." $( [ -z "$token" ] && echo "false" || echo "true" )

  items='{ "menuId": 1, "description": "Veggie", "price": 0.05 }'
  for (( i=0; i < 21; i++ ))
  do items+=', { "menuId": 1, "description": "Veggie", "price": 0.05 }'
  done
  
  result=$(execute_curl "-X POST $host/api/order -H 'Content-Type: application/json' -d '{\"franchiseId\": 1, \"storeId\":1, \"items\":[$items]}'  -H \"Authorization: Bearer $token\"")
  echo "Bought too many pizzas..." $result
  sleep $failed_order_login_time
  result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
  echo "Logging out hungry diner..." $result
  sleep $(( failed_order_duration - failed_order_login_time ))
done &
pid5=$!

# Wait for the background processes to complete
wait $pid1 $pid2 $pid3 $pid4 $pid5
