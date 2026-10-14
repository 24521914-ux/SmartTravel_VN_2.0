"""Owned disposable Rabbit fixture; never changes persisted Compose resources."""
from pathlib import Path
import os
import secrets
import subprocess
import time

ROOT=Path(__file__).resolve().parents[2]

class BrokerFixture:
    def __init__(self, service, run):
        self.service=service
        self.run=run
        self.name=f'smarttravel-{service}-broker-test-'+secrets.token_hex(6)
        self.started=False
        self.env=dict(os.environ,RABBITMQ_DEFAULT_USER='platform_admin',RABBITMQ_DEFAULT_PASS=secrets.token_hex(24),
                      IDENTITY_BROKER_PASSWORD=secrets.token_hex(24),BROKER_FIXTURE_PASSWORD=secrets.token_hex(24))
        self.env[service.upper()+'_BROKER_PASSWORD']=secrets.token_hex(24)
        self.env[service.upper()+'_BROKER_OPERATOR_PASSWORD']=secrets.token_hex(24)
    def start(self):
        args=['docker','run','--rm','-d','--name',self.name]
        for key in ['RABBITMQ_DEFAULT_USER','RABBITMQ_DEFAULT_PASS','IDENTITY_BROKER_PASSWORD','BROKER_FIXTURE_PASSWORD',
                    self.service.upper()+'_BROKER_PASSWORD',self.service.upper()+'_BROKER_OPERATOR_PASSWORD']:
            args+=['-e',key]
        args+=['-e','RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=+S 2:2','-e','RABBITMQ_CTL_ERL_ARGS=+S 2:2',
               '-p','127.0.0.1::5672','rabbitmq:4.1-management-alpine']
        self.run(args,self.env);self.started=True
        for _ in range(120):
            probe=subprocess.run(['docker','exec','--user','rabbitmq',self.name,'rabbitmq-diagnostics','-q','check_port_connectivity'],capture_output=True)
            if probe.returncode==0:break
            time.sleep(1)
        else:raise RuntimeError('Rabbit fixture startup timeout')
        self.run(['docker','exec','--user','rabbitmq','-i',self.name,'bash'],self.env,
                 (ROOT/'backend/infra/rabbit/bootstrap-broker.sh').read_text(encoding='utf-8'))
        port=self.run(['docker','port',self.name,'5672'],self.env).split(':')[-1]
        return {self.service.upper()+'_TRANSPORT_TESTS':'true','BROKER_HOST':'127.0.0.1','BROKER_PORT':port,
                'BROKER_VHOST':'smarttravel',self.service.upper()+'_BROKER_PASSWORD':self.env[self.service.upper()+'_BROKER_PASSWORD'],
                'BROKER_FIXTURE_PASSWORD':self.env['BROKER_FIXTURE_PASSWORD'],
                self.service.upper()+'_BROKER_OPERATOR_PASSWORD':self.env[self.service.upper()+'_BROKER_OPERATOR_PASSWORD']}
    def close(self):
        if self.started:self.run(['docker','stop',self.name],self.env)
