import { sleep, check, group, fail } from 'k6'
import http from 'k6/http'

export const options = {
  cloud: {
    distribution: { 'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 100 } },
    apm: [],
  },
  thresholds: {},
  scenarios: {
    Scenario_1: {
      executor: 'ramping-vus',
      gracefulStop: '30s',
      stages: [
        { target: 5, duration: '30s' },
        { target: 15, duration: '1m' },
        { target: 10, duration: '30s' },
        { target: 0, duration: '30s' },
      ],
      gracefulRampDown: '30s',
      exec: 'scenario_1',
    },
  },
}

export function scenario_1() {
  let response

  const vars = {
    authToken: undefined,
    jwt: undefined
  };

  group('Home - https://pizza.gerleksgarage.click/', function () {
    // Login
    response = http.put(
      'https://pizza-service.gerleksgarage.click/api/auth',
      '{"email":"d@jwt.com","password":"diner"}',
      {
        headers: {
          accept: '*/*',
          'accept-encoding': 'gzip, deflate, br, zstd',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
          dnt: '1',
          origin: 'https://pizza.gerleksgarage.click',
          priority: 'u=1, i',
          'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'sec-gpc': '1',
        },
      }
    )
    if (!check(response, { 'status equals 200': response => response.status.toString() === '200' })) {
      console.log(response.body);
      fail("Login was *not* 200");
    }
    vars.authToken = response.json().token;

    sleep(4.2)

    // Get menu
    response = http.get('https://pizza-service.gerleksgarage.click/api/order/menu', {
      headers: {
        accept: '*/*',
        authorization: `Bearer ${vars.authToken}`,
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/json',
        dnt: '1',
        'if-none-match': 'W/"1fc-cgG/aqJmHhElGCplQPSmgl2Gwk0"',
        origin: 'https://pizza.gerleksgarage.click',
        priority: 'u=1, i',
        'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'sec-gpc': '1',
      },
    })

    // Get franchises
    response = http.get(
      'https://pizza-service.gerleksgarage.click/api/franchise?page=0&limit=20&name=*',
      {
        headers: {
          accept: '*/*',
          authorization: `Bearer ${vars.authToken}`,
          'accept-encoding': 'gzip, deflate, br, zstd',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
          dnt: '1',
          'if-none-match': 'W/"76-MC6nZXkS39qDkkzGsPLfCWY39wE"',
          origin: 'https://pizza.gerleksgarage.click',
          priority: 'u=1, i',
          'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'sec-gpc': '1',
        },
      }
    )
    sleep(8.8)

    // Get user
    response = http.get('https://pizza-service.gerleksgarage.click/api/user/me', {
      headers: {
        accept: '*/*',
        authorization: `Bearer ${vars.authToken}`,
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/json',
        dnt: '1',
        origin: 'https://pizza.gerleksgarage.click',
        priority: 'u=1, i',
        'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'sec-gpc': '1',
      },
    })
    if (!check(response, { 'status equals 200': response => response.status.toString() === '200' })) {
      console.log(response.body);
      fail("Login was *not* 200");
    }

    sleep(2.6)

    // Place order
    response = http.post(
      'https://pizza-service.gerleksgarage.click/api/order',
      '{"items":[{"menuId":1,"description":"Veggie","price":0.0038},{"menuId":2,"description":"Pepperoni","price":0.0042},{"menuId":2,"description":"Pepperoni","price":0.0042}],"storeId":"1","franchiseId":1}',
      {
        headers: {
          accept: '*/*',
          authorization: `Bearer ${vars.authToken}`,
          'accept-encoding': 'gzip, deflate, br, zstd',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
          dnt: '1',
          origin: 'https://pizza.gerleksgarage.click',
          priority: 'u=1, i',
          'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'sec-gpc': '1',
        },
      }
    )
    vars.jwt = response.json().jwt;
    sleep(2.2)

    // Verify pizzas
    response = http.post(
      'https://pizza-factory.cs329.click/api/order/verify',
      `{"jwt":"${vars.jwt}"}`,
      {
        headers: {
          accept: '*/*',
          authorization: `Bearer ${vars.authToken}`,
          'accept-encoding': 'gzip, deflate, br, zstd',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
          dnt: '1',
          origin: 'https://pizza.gerleksgarage.click',
          priority: 'u=1, i',
          'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site',
          'sec-fetch-storage-access': 'active',
          'sec-gpc': '1',
        },
      }
    )
  })
}
