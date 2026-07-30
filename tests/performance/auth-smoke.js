import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.TOMUPRO_BASE_URL || 'http://127.0.0.1:4175';

export const options = {
  vus: 10,
  duration: '20s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/auth`);
  check(response, { 'status is 200': (result) => result.status === 200 });
  sleep(0.25);
}
