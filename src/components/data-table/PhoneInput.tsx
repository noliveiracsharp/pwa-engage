import { useEffect, useMemo, useState } from "react";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  countryFlag,
  digitsOnly,
  formatNationalPhone,
  joinPhoneValue,
  splitPhoneValue,
} from "@/lib/input-masks";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
};

const displayNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });
const COUNTRIES = getCountries()
  .map((code) => ({
    code,
    name: displayNames.of(code) ?? code,
    callingCode: getCountryCallingCode(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

export function PhoneInput({ id, value, onChange }: Props) {
  const initial = useMemo(() => splitPhoneValue(value), [value]);
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [nationalNumber, setNationalNumber] = useState(initial.nationalNumber);

  useEffect(() => {
    if (value === joinPhoneValue(country, nationalNumber)) return;
    const parsed = splitPhoneValue(value);
    setCountry(parsed.country);
    setNationalNumber(parsed.nationalNumber);
  }, [value, country, nationalNumber]);

  const changeCountry = (next: string) => {
    const nextCountry = next as CountryCode;
    setCountry(nextCountry);
    onChange(joinPhoneValue(nextCountry, nationalNumber));
  };

  const changeNumber = (input: string) => {
    const digits = digitsOnly(input).slice(0, 15);
    setNationalNumber(digits);
    onChange(joinPhoneValue(country, digits));
  };

  return (
    <div className="flex min-w-0 gap-2">
      <Select value={country} onValueChange={changeCountry}>
        <SelectTrigger className="w-[132px] shrink-0" aria-label="País e código telefônico">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {COUNTRIES.map((item) => (
            <SelectItem key={item.code} value={item.code}>
              <span className="flex items-center gap-2">
                <span aria-hidden="true">{countryFlag(item.code)}</span>
                <span className="max-w-44 truncate">{item.name}</span>
                <span className="text-muted-foreground">+{item.callingCode}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        className="min-w-0 flex-1"
        value={formatNationalPhone(country, nationalNumber)}
        placeholder="Telefone"
        maxLength={24}
        onChange={(event) => changeNumber(event.target.value)}
      />
    </div>
  );
}