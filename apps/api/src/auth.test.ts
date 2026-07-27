import{createHash}from'node:crypto';
import{UnauthorizedException}from'@nestjs/common';
import{Reflector}from'@nestjs/core';
import{afterEach,beforeEach,describe,expect,it,vi}from'vitest';
import{verify}from'argon2';
import{db}from'@tgs/database';
import{AuthController}from'./auth.js';
import{AuthGuard,buildSessionCookie,SESSION_COOKIE,secureCookies}from'./infrastructure.js';

vi.mock('@tgs/database',()=>({
  db:{
    loginAttempt:{count:vi.fn(),create:vi.fn()},
    user:{findUnique:vi.fn(),update:vi.fn()},
    session:{create:vi.fn(),findUnique:vi.fn(),update:vi.fn(),delete:vi.fn()},
    auditLog:{create:vi.fn()},
    $transaction:vi.fn(),
  },
}));

vi.mock('argon2',()=>({verify:vi.fn()}));

const fakeUser={
  id:'user-test-1',
  username:'tester',
  displayName:'Tester',
  active:true,
  passwordHash:'$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
};

function mockRes(){
  const headers:Record<string,string>={};
  return{
    header:(name:string,value:string)=>{headers[name]=value},
    headers,
  };
}

function httpCtx(req:Record<string,unknown>){
  return{
    getHandler:()=>({}),
    getClass:()=>({}),
    switchToHttp:()=>({getRequest:()=>req}),
  } as any;
}

describe('AuthController Block 0',()=>{
  const auth=new AuthController();

  beforeEach(()=>{
    vi.clearAllMocks();
    process.env.LOGIN_MAX_ATTEMPTS='5';
    process.env.LOGIN_WINDOW_MINUTES='15';
    process.env.SESSION_TTL_DAYS='7';
    (db.$transaction as any).mockImplementation((ops:Promise<unknown>[])=>Promise.all(ops));
    (db.loginAttempt.create as any).mockResolvedValue({});
    (db.session.create as any).mockResolvedValue({id:'sess-1'});
    (db.user.update as any).mockResolvedValue({});
    (db.auditLog.create as any).mockResolvedValue({});
  });

  it('login exitoso crea token hasheado y cookie segura',async()=>{
    const prevForce=process.env.COOKIE_SECURE;process.env.COOKIE_SECURE='true';
    (db.loginAttempt.count as any).mockResolvedValue(0);
    (db.user.findUnique as any).mockResolvedValue(fakeUser);
    (verify as any).mockResolvedValue(true);
    const req={ip:'127.0.0.1',headers:{'user-agent':'vitest'}};
    const res=mockRes();

    const result=await auth.login({username:'tester',password:'unit-test-password-not-real'},req,res);
    if(prevForce===undefined)delete process.env.COOKIE_SECURE;else process.env.COOKIE_SECURE=prevForce;

    expect(result).toEqual({user:{id:fakeUser.id,username:fakeUser.username,displayName:fakeUser.displayName}});
    expect(result).not.toHaveProperty('passwordHash');
    expect(db.loginAttempt.create).toHaveBeenCalledWith({data:{username:'tester',ip:'127.0.0.1',success:true}});
    expect(db.session.create).toHaveBeenCalledOnce();
    const sessionData=(db.session.create as any).mock.calls[0][0].data;
    const cookie=res.headers['Set-Cookie']!;
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    const token=cookie.slice(SESSION_COOKIE.length+1).split(';')[0]!;
    expect(sessionData.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(sessionData.tokenHash).not.toBe(token);
    expect(cookie).not.toContain(sessionData.tokenHash);
  });

  it('bloquea por lockout tras demasiados intentos fallidos',async()=>{
    (db.loginAttempt.count as any).mockResolvedValue(5);
    const res=mockRes();

    await expect(auth.login({username:'tester',password:'unit-test-password-not-real'},{ip:'10.0.0.1',headers:{}},res))
      .rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.login({username:'tester',password:'unit-test-password-not-real'},{ip:'10.0.0.1',headers:{}},res))
      .rejects.toMatchObject({message:'Acceso bloqueado temporalmente por intentos fallidos'});
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('rechaza credenciales inválidas y registra intento fallido',async()=>{
    (db.loginAttempt.count as any).mockResolvedValue(0);
    (db.user.findUnique as any).mockResolvedValue(fakeUser);
    (verify as any).mockResolvedValue(false);
    const res=mockRes();

    await expect(auth.login({username:'tester',password:'wrong-password-not-real'},{ip:'127.0.0.1',headers:{}},res))
      .rejects.toMatchObject({message:'Credenciales inválidas'});
    expect(db.loginAttempt.create).toHaveBeenCalledWith({data:{username:'tester',ip:'127.0.0.1',success:false}});
    expect(db.session.create).not.toHaveBeenCalled();
  });
});

describe('Switch de cookie Secure Block 0',()=>{
  const originalEnv=process.env.NODE_ENV,originalForce=process.env.COOKIE_SECURE;
  afterEach(()=>{
    if(originalEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalEnv;
    if(originalForce===undefined)delete process.env.COOKIE_SECURE;else process.env.COOKIE_SECURE=originalForce;
  });

  it('usa Secure automáticamente en producción sin variable',()=>{
    process.env.NODE_ENV='production';delete process.env.COOKIE_SECURE;
    expect(secureCookies()).toBe(true);
    expect(buildSessionCookie('token-de-prueba',3600)).toContain('; Secure');
  });

  it('omite Secure en desarrollo sin variable',()=>{
    process.env.NODE_ENV='development';delete process.env.COOKIE_SECURE;
    expect(secureCookies()).toBe(false);
    expect(buildSessionCookie('token-de-prueba',3600)).not.toContain('; Secure');
  });

  it('respeta el override explícito en cualquier entorno',()=>{
    process.env.NODE_ENV='development';process.env.COOKIE_SECURE='true';
    expect(secureCookies()).toBe(true);
    process.env.NODE_ENV='production';process.env.COOKIE_SECURE='false';
    expect(secureCookies()).toBe(false);
  });

  it('mantiene HttpOnly, SameSite=Lax y Path=/ siempre',()=>{
    const cookie=buildSessionCookie('token-de-prueba',3600);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });
});

describe('AuthGuard Block 0',()=>{
  const reflector={getAllAndOverride:vi.fn()} as unknown as Reflector;
  const guard=new AuthGuard(reflector);

  beforeEach(()=>{
    vi.clearAllMocks();
    process.env.SESSION_TTL_DAYS='7';
    process.env.SESSION_RENEWAL_PERCENT='25';
    (reflector.getAllAndOverride as any).mockReturnValue(false);
  });

  it('rechaza peticiones sin cookie de sesión',async()=>{
    const req={headers:{}};
    await expect(guard.canActivate(httpCtx(req))).rejects.toMatchObject({message:'Sesión requerida'});
    expect(db.session.findUnique).not.toHaveBeenCalled();
  });

  it('valida sesión, inyecta user y renueva sliding expiry',async()=>{
    const token='unit-test-session-token-not-real';
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const ttl=7*86400000;
    const expiresAt=new Date(Date.now()+Math.floor(ttl*0.1));
    (db.session.findUnique as any).mockResolvedValue({
      id:'sess-renew',
      tokenHash,
      expiresAt,
      user:{id:fakeUser.id,username:fakeUser.username,displayName:fakeUser.displayName,active:true},
    });
    (db.session.update as any).mockResolvedValue({});
    const req:any={headers:{cookie:`${SESSION_COOKIE}=${token}`}};

    await expect(guard.canActivate(httpCtx(req))).resolves.toBe(true);
    expect(req.user).toEqual({id:fakeUser.id,username:fakeUser.username,displayName:fakeUser.displayName});
    expect(req.sessionId).toBe('sess-renew');
    expect(db.session.findUnique).toHaveBeenCalledWith({where:{tokenHash},include:{user:true}});
    expect(db.session.update).toHaveBeenCalledWith({
      where:{id:'sess-renew'},
      data:expect.objectContaining({renewedAt:expect.any(Date),expiresAt:expect.any(Date)}),
    });
    const renewed=(db.session.update as any).mock.calls[0][0].data.expiresAt as Date;
    expect(renewed.getTime()).toBeGreaterThan(Date.now()+ttl*0.9);
  });
});
