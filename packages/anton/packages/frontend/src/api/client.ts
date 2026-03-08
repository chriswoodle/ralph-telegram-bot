import { HttpClient } from './http-client';
import { Api } from './Api';

const httpClient = new HttpClient();
export const api = new Api(httpClient);
